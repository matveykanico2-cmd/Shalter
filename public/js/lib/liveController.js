import { api } from "../api.js";
import { wsSend, onWsMessage, isWsOpen } from "./wsClient.js";
import { getState } from "../state.js";
import { HD_SCREEN, cameraConstraints, tunePeerVideo, hintScreenTrack } from "./mediaQuality.js";

// Медиа эфира: кто кому и что отправляет.
//
// Схема — «каждый вещающий соединяется с каждым», без сервера-пересборщика
// (SFU). Из этого следует всё остальное: вещают только ведущий и те, кому дали
// слово, а зритель ничего не отправляет и только принимает. Поэтому нагрузка
// растёт по числу зрителей у одного вещающего, и эфир здесь — на десяток-другой
// человек. Это ограничение схемы, а не недоделка: снимается оно только
// отдельной службой-ретранслятором.
//
// Кто кому звонит (важно, иначе оба шлют offer одновременно и соединение
// разваливается): предложение всегда отправляет вещающий. Если вещают оба —
// ведущий и получивший слово, — предлагает тот, чей идентификатор меньше.

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

let state = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(view());
}

export function subscribeLive(fn) {
  listeners.add(fn);
  fn(view());
  return () => listeners.delete(fn);
}

export function getLiveState() {
  return view();
}

function view() {
  if (!state) return null;
  return {
    stream: state.stream,
    // Адрес, по которому зритель забирает картинку эфира из OBS. Ключ потока
    // сюда не попадает — прокси на сервере сам знает, за чем идти.
    flvUrl: isRtmp() ? `/api/live/${state.stream.id}/feed.flv` : null,
    ingest: state.ingest,
    participants: state.participants,
    messages: state.messages,
    me: state.me,
    myRole: state.myRole,
    localStream: state.localStream,
    remoteStreams: state.remoteStreams,
    micOn: state.micOn,
    camOn: state.camOn,
    sharing: state.sharing,
    canShare: publishes(state.myRole),
    error: state.error,
  };
}

// Кто вещает из браузера. В эфире из OBS — никто: картинка и звук идут на
// сервер по RTMP и раздаются потоком (server/rtmp.js), а браузер, включая
// браузер ведущего, только смотрит. Поэтому здесь не поднимается ни одного
// соединения и ни у кого не спрашивают камеру.
const isRtmp = () => state?.stream?.source === "rtmp";
const publishes = (role) => !isRtmp() && (role === "host" || role === "speaker");

function sendSignal(toUserId, kind, data) {
  if (isWsOpen()) wsSend({ type: "live:signal:send", streamId: state.stream.id, toUserId, kind, data });
}

// Инициатор — вещающий; между двумя вещающими решает сравнение id, чтобы
// предложение шло ровно с одной стороны.
function shouldOffer(otherRole, otherId) {
  if (!publishes(state.myRole)) return false;
  if (!publishes(otherRole)) return true;
  return state.me.id < otherId;
}

function createPeer(otherUserId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const sending = new Set();
  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => {
      pc.addTrack(t, state.localStream);
      sending.add(t.kind);
    });
    // Потолок битрейта и приоритет «кадры или чёткость» держатся на сендере и
    // умирают вместе с соединением, поэтому задаются на каждом новом peer.
    tunePeerVideo(pc, { screen: state.sharing });
  }
  // Медиа-линия на приём для всего, что мы сами не отправляем.
  //
  // Зрителю это нужно очевидным образом: он не отправляет ничего, и без этих
  // строк его предложение уходило бы пустым — живое соединение и тишина в нём.
  // Но и вещающему тоже: у получившего слово есть только микрофон, и в его
  // предложении была бы одна звуковая линия — видео ведущего класть некуда,
  // и человек, которому дали слово, переставал видеть эфир, в котором говорит.
  // Отвечающая сторона добавить линию не может, это делается только в
  // предложении, — поэтому линии заводятся здесь, всегда обе.
  for (const kind of ["audio", "video"]) {
    if (!sending.has(kind)) pc.addTransceiver(kind, { direction: "recvonly" });
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(otherUserId, "ice", e.candidate.toJSON());
  };
  pc.ontrack = (e) => {
    state.remoteStreams = { ...state.remoteStreams, [otherUserId]: e.streams[0] };
    notify();
  };
  state.peers.set(otherUserId, pc);
  return pc;
}

async function offerTo(userId) {
  const pc = state.peers.get(userId) ?? createPeer(userId);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(userId, "offer", offer);
  } catch {
    // Не удалось договориться с этим участником — остальные не должны страдать.
  }
}

function dropPeer(userId) {
  const pc = state.peers.get(userId);
  if (pc) {
    try {
      pc.close();
    } catch {
      /* уже закрыт */
    }
    state.peers.delete(userId);
  }
  if (state.remoteStreams[userId]) {
    const next = { ...state.remoteStreams };
    delete next[userId];
    state.remoteStreams = next;
  }
}

async function handleSignal(msg) {
  if (!state || msg.streamId !== state.stream.id) return;
  const from = msg.fromUserId;
  try {
    if (msg.kind === "offer") {
      const existing = state.peers.get(from);
      if (existing) {
        // Столкновение предложений: мы уже отправили своё и ждём ответа, а
        // навстречу пришло чужое (обе стороны перезапустились разом — например,
        // ведущий дал слово двоим сразу). Расходимся по тому же признаку, что
        // решает, кто предлагает вообще: чей идентификатор меньше, тот не
        // уступает и ждёт ответа на своё; чей больше — принимает чужое. Признак
        // один и тот же с обеих сторон, поэтому уступает ровно один.
        if (existing.signalingState !== "stable" && state.me.id < from) return;
        // Предложение всегда приходит с заново созданного соединения (см.
        // republish), а наше старое согласовано под другой набор дорожек — у
        // него другое число медиа-линий, и браузер откажется применять к нему
        // чужой SDP. Поэтому старое выбрасываем и принимаем предложение на
        // чистое: предлагающая сторона здесь главная.
        dropPeer(from);
      }
      const pc = createPeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(from, "answer", answer);
    } else if (msg.kind === "answer") {
      const pc = state.peers.get(from);
      if (pc && pc.signalingState !== "stable") await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
    } else if (msg.kind === "ice") {
      const pc = state.peers.get(from);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.data));
    }
  } catch {
    // Просроченный или несогласованный сигнал — соединение восстановится на
    // следующем изменении состава.
  }
}

// Своё медиа берётся ровно под роль: ведущему — камера и микрофон (или только
// микрофон, если эфир голосовой), получившему слово — микрофон, зрителю —
// ничего. Просить камеру у зрителя значит спрашивать разрешение у человека,
// который пришёл посмотреть.
async function acquireMedia() {
  if (isRtmp()) return null;
  // Камера — и ведущему, и тем, кому дали слово: эфир может быть совместным,
  // с несколькими людьми в кадре. Раньше видео брал только ведущий, а
  // получивший слово оставался голосом за кадром — даже когда речь шла о
  // разговоре вдвоём или втроём.
  //
  // Зрителя это не касается: у него камеру не спрашивают вовсе, пока ему не
  // дали слово.
  const wantVideo = publishes(state.myRole) && state.stream.withVideo;
  const wantAudio = publishes(state.myRole);
  if (!wantAudio && !wantVideo) return null;
  try {
    // 1080p60 мягкими ideal-ограничениями (lib/mediaQuality.js). Раньше здесь
    // стояло `video: true` — то есть 640×480/30 на большинстве браузеров.
    return await navigator.mediaDevices.getUserMedia({
      audio: wantAudio,
      video: wantVideo ? cameraConstraints() : false,
    });
  } catch (err) {
    state.error = wantVideo ? "Нет доступа к камере или микрофону" : "Нет доступа к микрофону";
    return null;
  }
}

// То, что уходит зрителям, собирается из двух источников: звук всегда с
// микрофона, а картинка — либо камера, либо экран. Держать их порознь
// обязательно: иначе остановка показа экрана требовала бы заново спрашивать
// камеру (второе разрешение, секунда чёрного кадра), а во время показа
// микрофон бы отваливался вместе с камерой.
function composeLocalStream() {
  const out = new MediaStream();
  state.camStream?.getAudioTracks().forEach((t) => out.addTrack(t));
  const video = state.screenTrack ?? state.camStream?.getVideoTracks()[0] ?? null;
  if (video) out.addTrack(video);
  state.localStream = out.getTracks().length ? out : null;
}

function stopScreen() {
  if (!state.screenTrack) return;
  state.screenTrack.onended = null;
  try {
    state.screenTrack.stop();
  } catch {
    /* дорожка уже остановлена самим браузером */
  }
  state.screenTrack = null;
  state.sharing = false;
}

function stopLocalMedia() {
  state.camStream?.getTracks().forEach((t) => t.stop());
  state.camStream = null;
  stopScreen();
  state.localStream = null;
}

// Пересобрать своё вещание — при получении или потере слова. Проще и надёжнее
// перезаключить соединения, чем добавлять дорожки к уже согласованным: цена —
// секунда переподключения ровно у того, кому дали слово.
async function refreshPublishing() {
  stopLocalMedia();
  // Соединения рвутся до запроса камеры, а не после, и это важнее, чем
  // выглядит. Роль меняет сервер, его рассылку получают обе стороны, и вторая
  // прямо сейчас шлёт нам offer. Если рвать соединения после await, offer
  // успевает прийти в промежутке: мы отвечаем на него по старому соединению —
  // и тут же его закрываем. Предлагать больше некому, и человек, которому
  // только что дали слово, остаётся неслышимым до следующего изменения
  // состава. Рвём сразу — тогда offer из промежутка попадает уже на новое
  // соединение, которое мы и оставим.
  for (const id of [...state.peers.keys()]) dropPeer(id);
  state.camStream = await acquireMedia();
  // Предлагаем всем сами — см. republish ниже. Соединение, которое успело
  // завестись от чужого offer, пока мы ждали микрофон, там же и выбрасывается:
  // оно родилось до того, как у нас появились дорожки, и умеет только
  // принимать.
  await republish();
}

// Пересобрать соединения под текущий набор дорожек.
//
// Почему целиком, а не заменой дорожки на лету: replaceTrack умеет заменить
// видео только там, где видеосендер уже есть. У ведущего голосового эфира и у
// получившего слово его нет вовсе, и первая же демонстрация экрана требует
// нового согласования. Развилка «есть сендер — меняем, нет — пересогласуем»
// даёт два пути, из которых второй почти не проверяется; здесь всегда второй.
// Цена — та же секунда переподключения, что и при выдаче слова.
// Пересборка своих соединений под сменившийся набор дорожек: сменилась роль
// или включилась/выключилась демонстрация экрана.
//
// Предлагаем всем сами, а не по правилу «предлагает тот, чей id меньше».
// Правило разводит две стороны, которые узнали новость одновременно, — но
// здесь стороны не равны: набор дорожек изменился у меня, соединения оборвал
// я, и у второй стороны может вообще ничего не произойти (показ экрана сервер
// не рассылает). Ждать offer было бы не от кого.
//
// Вторая половина того же решения — в connectAll: он больше не предлагает
// тем, с кем соединение уже есть. Иначе на смене роли предлагали бы обе
// стороны разом, и предложения гасили бы друг друга.
async function republish() {
  for (const id of [...state.peers.keys()]) dropPeer(id);
  composeLocalStream();
  applyMuteFlags();
  for (const p of state.participants) {
    if (p.userId !== state.me.id) await offerTo(p.userId);
  }
  notify();
}

function applyMuteFlags() {
  const mine = state.participants.find((p) => p.userId === state.me.id);
  const forcedMute = !!mine?.mutedByHost;
  state.localStream?.getAudioTracks().forEach((t) => (t.enabled = state.micOn && !forcedMute));
  // Кнопка «Камера» выключает камеру, а не показ экрана: пока идёт
  // демонстрация, зрители смотрят экран, и гасить его выключателем камеры
  // означало бы чёрный прямоугольник вместо показа.
  state.localStream?.getVideoTracks().forEach((t) => {
    t.enabled = t === state.screenTrack ? true : state.camOn;
  });
}

// Предложения — только тем, с кем соединения ещё нет: это вход нового человека
// в эфир. Пересогласование существующего соединения — забота той стороны, у
// которой что-то изменилось (republish выше), и переспрашивать его отсюда
// значило бы отвечать на чужое изменение своим встречным предложением.
async function connectAll() {
  for (const p of state.participants) {
    if (p.userId === state.me.id) continue;
    const existing = state.peers.get(p.userId);
    // Отвалившееся соединение — исключение из правила выше: пересогласовывать
    // на нём нечего, его нужно строить заново. Раньше на любое изменение
    // состава предложение уходило всем подряд, и такие соединения иногда
    // чинились сами собой; теперь чиним их здесь явно, а не как побочный
    // эффект лишних предложений.
    if (existing && (existing.connectionState === "failed" || existing.connectionState === "closed")) {
      dropPeer(p.userId);
    } else if (existing) {
      continue;
    }
    if (shouldOffer(p.role, p.userId)) await offerTo(p.userId);
  }
}

async function applyState(data) {
  const prevRole = state.myRole;
  state.stream = data.stream;
  state.participants = data.participants;
  if (data.messages) state.messages = data.messages;
  state.myRole = data.participants.find((p) => p.userId === state.me.id)?.role ?? "viewer";

  // Ушедшие — закрыть, чтобы не держать мёртвые соединения и чёрные плитки.
  const present = new Set(data.participants.map((p) => p.userId));
  for (const id of [...state.peers.keys()]) if (!present.has(id)) dropPeer(id);

  if (state.myRole !== prevRole) {
    // Слово только что дали — камеру не включаем сама собой.
    //
    // Человек согласился говорить, а не показываться: включённая без спроса
    // камера в чужом эфире — это то, за что извиняются потом. Кнопка «Камера»
    // рядом, и решение остаётся за ним. Ведущего это не касается: он эфир и
    // начал, у него камера с самого начала.
    if (prevRole === "viewer" && state.myRole === "speaker") state.camOn = false;
    await refreshPublishing();
    return;
  }
  applyMuteFlags();
  await connectAll();
  notify();
}

export async function joinLive(streamId) {
  if (state?.stream?.id === streamId) return view();
  if (state) await leaveLive();

  const me = getState().user;
  state = {
    me,
    stream: { id: streamId },
    participants: [],
    messages: [],
    myRole: "viewer",
    peers: new Map(),
    remoteStreams: {},
    localStream: null,
    camStream: null,
    screenTrack: null,
    sharing: false,
    micOn: true,
    camOn: true,
    ingest: null,
    error: null,
    unsubs: [],
  };

  const data = await api.joinLive(streamId);
  state.stream = data.stream;
  // Куда вещать — приходит только ведущему rtmp-эфира (server/routes/live.js).
  if (data.ingest) state.ingest = data.ingest;
  state.participants = data.participants;
  state.messages = data.messages;
  state.myRole = data.participants.find((p) => p.userId === me.id)?.role ?? "viewer";
  state.camStream = await acquireMedia();
  composeLocalStream();
  applyMuteFlags();

  state.unsubs.push(onWsMessage("live:signal", handleSignal));
  state.unsubs.push(
    onWsMessage("live:state", async (msg) => {
      if (!state || msg.streamId !== state.stream.id) return;
      try {
        const next = await api.getLive(state.stream.id);
        if (next.ingest) state.ingest = next.ingest;
        await applyState(next);
      } catch {
        // Эфир мог закончиться между событием и запросом — это разберёт
        // live:ended ниже.
      }
    })
  );
  state.unsubs.push(
    onWsMessage("live:message", (msg) => {
      if (!state || msg.streamId !== state.stream.id) return;
      state.messages = [...state.messages, msg.message];
      notify();
    })
  );
  state.unsubs.push(
    onWsMessage("live:ended", (msg) => {
      if (!state || msg.streamId !== state.stream.id) return;
      state.stream = { ...state.stream, status: "ended" };
      notify();
      teardown();
    })
  );

  await connectAll();
  notify();
  return view();
}

function teardown() {
  if (!state) return;
  state.unsubs.forEach((u) => u());
  for (const id of [...state.peers.keys()]) dropPeer(id);
  stopLocalMedia();
  state = null;
  notify();
}

export async function leaveLive() {
  if (!state) return;
  const id = state.stream.id;
  teardown();
  await api.leaveLive(id).catch(() => {});
}

// Ошибка завершения не проглатывается, в отличие от выхода: выйти можно
// всегда — сам факт ухода не зависит от сервера, — а вот эфир после неудачного
// «Завершить» продолжает идти. Раньше здесь стоял .catch(() => {}), и отказ
// сервера выглядел на экране как успех: окно закрывалось, плашка «идёт эфир»
// оставалась висеть в чате, и завершить эфир было уже нечем.
export async function stopLive() {
  if (!state) return;
  const id = state.stream.id;
  await api.stopLive(id);
  teardown();
}

export function toggleMic() {
  if (!state) return;
  state.micOn = !state.micOn;
  applyMuteFlags();
  notify();
}

export function toggleCam() {
  if (!state) return;
  state.camOn = !state.camOn;
  applyMuteFlags();
  notify();
}

// Демонстрация экрана в эфире. Доступна тем же, кто вообще вещает, — ведущему и
// получившим слово: у зрителя нет исходящего потока, и показывать ему нечем.
//
// Экран занимает место камеры в исходящем видео, а не добавляется вторым
// потоком: вторая дорожка означала бы второе видео у каждого зрителя, а схема
// здесь «каждый с каждым» — то есть удвоенный исходящий канал у ведущего на
// каждого смотрящего.
export async function toggleScreenShare() {
  if (!state || !publishes(state.myRole)) return;

  if (state.sharing) {
    stopScreen();
    await republish();
    return;
  }

  let display = null;
  try {
    display = await navigator.mediaDevices.getDisplayMedia(HD_SCREEN);
  } catch {
    // Окно выбора закрыли или браузер запретил — молча, это не ошибка эфира.
    return;
  }
  const track = display.getVideoTracks()[0];
  if (!track) return;

  hintScreenTrack(track);
  state.screenTrack = track;
  state.sharing = true;
  // «Остановить показ» в панели самого браузера — не наша кнопка, но эфир
  // должен на неё реагировать так же, как на свою: иначе показ кончился, а
  // зрители видят замерший кадр.
  track.onended = () => {
    if (!state || !state.sharing) return;
    stopScreen();
    republish();
  };
  await republish();
}
