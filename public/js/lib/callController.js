import { api } from "../api.js";
import { getFlippedTrack, cameraCount } from "./cameraSwitch.js";
import { HD_VIDEO, HD_SCREEN, cameraConstraints, tuneVideoSender, hintScreenTrack } from "./mediaQuality.js";
import { getState as getAppState } from "../state.js";
import { onWsMessage, wsSend, isWsOpen } from "./wsClient.js";
import { navigate } from "../router.js";
import { startRingback, stopRingtone } from "./ringtone.js";
import { fetchIceServers } from "./iceServers.js";

// Set by join() before any peer is created — see server/lib/turnCredentials.js
// and lib/iceServers.js for where this actually comes from.
let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

let state = null; // active call state, or null if no call in progress
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(state));
}

export function subscribeCall(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCallState() {
  return state;
}

function sendSignal(toUserId, kind, data) {
  if (isWsOpen()) {
    wsSend({ type: "call:signal:send", callId: state.call.id, toUserId, kind, data });
  } else {
    api.sendSignal(state.call.id, toUserId, kind, data).catch(() => {});
  }
}

const ICE_FAILURE_MESSAGE = "Не удалось установить соединение — проверьте сеть и попробуйте позвонить снова";
// A stuck negotiation (TURN relay unreachable/overloaded, restrictive
// firewall) previously had *no* failure path at all: connectionstatechange
// only ever handled "connected", so a call that couldn't connect just sat on
// "Вызов…" with the ringback playing forever — indistinguishable from a call
// that was about to connect any second. That's the bug behind "calls don't
// connect": they don't fail loudly, they fail silently and permanently.
const CONNECT_TIMEOUT_MS = 20000;
const RESTART_GRACE_MS = 10000;

// Что сейчас уходит собеседнику. Видеосендеров два:
//
// - основной (_videoSender) — камера, а во время демонстрации экран;
// - второй (_camSender) — камера во время демонстрации, чтобы показывающего
//   было видно вместе с экраном, а не вместо него.
//
// Пересогласования соединения в этом файле нет (см. handleSignal: offer
// принимается только первый), поэтому оба сендера заводятся сразу, пустыми, а
// дальше на них только меняются дорожки. Пустой сендер ничего не стоит.
function applyOutgoing(pc) {
  const cam = state.cameraOn ? state.localStream?.getVideoTracks()[0] ?? null : null;
  const main = state.sharing ? state.screenTrack : cam;
  const second = state.sharing ? cam : null;
  const audio = state.screenAudio?.mixed ?? state.localStream?.getAudioTracks()[0] ?? null;
  const put = (sender, track, opts) => {
    if (!sender || sender.track === track) return;
    sender
      .replaceTrack(track)
      .then(() => tuneVideoSender(sender, opts))
      .catch(() => {});
  };
  put(pc._videoSender, main, { screen: state.sharing });
  put(pc._camSender, second, {});
  // Звук без настройки битрейта — tuneVideoSender его сам пропустит.
  put(pc._audioSender, audio, {});
}

function broadcastMedia() {
  state.others.forEach((p) => sendMedia(p.id));
}

// Камера и показ экрана — отдельным сигналом, а не по самой дорожке: экран
// приходит в том же сендере, где была камера, а выключенная камера — это
// дорожка, которая просто молчит. Со стороны получателя ни то, ни другое не
// отличить.
function sendMedia(userId) {
  sendSignal(userId, "media", { camera: !!state.cameraOn, sharing: !!state.sharing });
}

// Видеотранссиверы соединения в порядке m-строк SDP. Первый — основная
// картинка, второй — камера во время демонстрации. Порядок один и тот же у
// обеих сторон, потому что обе читают его из одного описания сессии.
function videoTransceivers(pc) {
  return pc
    .getTransceivers()
    .filter((t) => t.mid != null && t.receiver.track.kind === "video")
    .sort((a, b) => Number(a.mid) - Number(b.mid));
}

// answering: соединение заводится в ответ на чужой offer. Тогда свои пустые
// транссиверы заводить нельзя — принимающая сторона их к m-строкам offer'а не
// привяжет (привязываются только созданные через addTrack), и замена дорожки в
// таком сендере уходила бы в никуда. Сендеры берутся после
// setRemoteDescription, см. adoptTransceivers.
function createPeer(otherUserId, { answering = false } = {}) {
  const pc = new RTCPeerConnection({ iceServers });
  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
    pc._audioSender = pc.getSenders().find((s) => s.track?.kind === "audio") ?? null;
  }
  if (!answering) {
    // No local mic (denied permission or no device) — still negotiate
    // recvonly so the *other* side's audio reaches us. Without this, a failed
    // getUserMedia would silently skip the offer entirely and the call would
    // just sit there connecting nothing.
    if (!pc._audioSender) pc.addTransceiver("audio", { direction: "recvonly" });
    const cam = state.localStream?.getVideoTracks()[0] ?? null;
    // Video is sendrecv even without a camera: camera and screen-share can be
    // turned on later via replaceTrack, and there's no renegotiation to add a
    // sender then.
    pc._videoSender = cam
      ? pc.getSenders().find((s) => s.track === cam) ?? null
      : pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    pc._camSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    applyOutgoing(pc);
  }
  // Собеседник узнаёт, что у нас с камерой и экраном, — даже если он ещё не
  // ответил: сигнал дождётся его на сервере (см. поллинг в join).
  sendMedia(otherUserId);

  let restarted = false;
  function handleStuck() {
    if (!state || pc.connectionState === "connected" || pc.connectionState === "closed") return;
    // Собеседник ещё не ответил — это не «не соединяется», это «ещё звонит».
    // В групповом звонке вызывают сразу всех, и один не взявший трубку иначе
    // показывал бы ошибку связи всем остальным. Отсчёт — с момента ответа.
    if (!pc.currentRemoteDescription) {
      setTimeout(handleStuck, CONNECT_TIMEOUT_MS);
      return;
    }
    if (!restarted) {
      restarted = true;
      try {
        pc.restartIce();
      } catch {
        // Unsupported/already-closed — the timeout below still catches it.
      }
      setTimeout(handleStuck, RESTART_GRACE_MS);
      return;
    }
    state.connectionError = ICE_FAILURE_MESSAGE;
    stopRingtone();
    notify();
  }
  const watchdog = setTimeout(handleStuck, CONNECT_TIMEOUT_MS);

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(otherUserId, "ice", e.candidate.toJSON());
  };
  // Поток собирается здесь сам, а не берётся из e.streams: у дорожки из
  // пустого транссивера (см. createPeer) потока нет вовсе, и раньше она
  // затирала уже пришедший звук пустым значением.
  pc.ontrack = (e) => {
    const track = e.track;
    if (track.kind === "video" && videoTransceivers(pc).indexOf(e.transceiver) > 0) {
      state.remoteCamStreams = { ...state.remoteCamStreams, [otherUserId]: new MediaStream([track]) };
    } else {
      const prev = state.remoteStreams[otherUserId]?.getTracks().filter((t) => t.kind !== track.kind) ?? [];
      state.remoteStreams = { ...state.remoteStreams, [otherUserId]: new MediaStream([...prev, track]) };
    }
    notify();
  };
  // Соединение считается состоявшимся по двум признакам, а не по одному.
  //
  // connectionState — сводное состояние, и оно доходит до "connected" не
  // всегда: у принимающей стороны оно застревает в "connecting", хотя ICE уже
  // соединён и звук с картинкой идут. Замер на двух браузерах: у звонящего
  // "connected/connected", у принявшего "connecting/connected" — и так и
  // остаётся. Экран при этом висел на «Вызов…», таймер разговора не шёл, и со
  // стороны это выглядело как «нажал ответить, а звонок не соединился».
  //
  // Поэтому смотрим ещё и на iceConnectionState: "connected" или "completed"
  // означают, что путь для медиа найден и данные пошли. Этого достаточно, а
  // ждать сводного состояния — значит ждать того, что может не наступить.
  const looksConnected = () =>
    pc.connectionState === "connected" || pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";

  const onStateChange = () => {
    state.connectedPeers = { ...state.connectedPeers, [otherUserId]: looksConnected() };
    // Only a real connection ends the ring — not a fixed timer (that was
    // cosmetic and had nothing to do with whether media actually flowed).
    if (looksConnected()) {
      clearTimeout(watchdog);
      state.connectionError = null;
      if (state.phase === "ringing") {
        state.phase = "connected";
        stopRingtone();
      }
    } else if (pc.connectionState === "failed" || pc.iceConnectionState === "failed") {
      handleStuck();
    }
    notify();
  };
  pc.onconnectionstatechange = onStateChange;
  // Второе событие обязательно: у застрявшего в "connecting" соединения
  // onconnectionstatechange больше не сработает, и без этой строки мы просто
  // не узнаем, что связь уже есть.
  pc.oniceconnectionstatechange = onStateChange;
  state.peers.set(otherUserId, pc);
  return pc;
}

// Кто в паре начинает соединение. Правило одно на всех, иначе двое пошлют
// offer друг другу одновременно и не соединятся оба.
//
// Звонивший — всегда он. Остальные — по старшинству id. Раньше offer'ы слал
// только звонивший и те, кто уже сидел в звонке, когда добавили новичка: в
// группе, где вызвали сразу всех, двое ответивших слышали звонившего, но не
// друг друга. Offer тому, кто ещё не ответил, не пропадает — он дождётся его
// на сервере и заберёт при входе (поллинг в join).
function shouldOffer(userId) {
  const callerId = state.call.callerId;
  if (state.me.id === callerId) return true;
  if (userId === callerId) return false;
  return state.me.id > userId;
}

async function offerTo(userId) {
  if (state.offered.has(userId)) return;
  state.offered.add(userId);
  const pc = state.peers.get(userId) ?? createPeer(userId);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(userId, "offer", offer);
  } catch {
    // Local media/negotiation failure — leave this peer unconnected.
  }
}

async function handleSignal(sig) {
  if (!state || sig.callId !== state.call.id) return;
  try {
    if (sig.kind === "offer") {
      // Wait for our own getUserMedia attempt to settle before creating the
      // peer. createPeer() locks in recvonly if state.localStream isn't set
      // yet, and there's no renegotiation path to add real tracks later — if
      // an offer arrived while a permission prompt was still up (common,
      // since that's human-speed vs. a WS round-trip), we'd be stuck sending
      // nothing for the whole call.
      await state.mediaReadyPromise;
      if (!state || sig.callId !== state.call.id) return;
      const pc = state.peers.get(sig.fromUserId) ?? createPeer(sig.fromUserId, { answering: true });
      await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
      adoptTransceivers(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(sig.fromUserId, "answer", answer);
    } else if (sig.kind === "answer") {
      const pc = state.peers.get(sig.fromUserId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
    } else if (sig.kind === "ice") {
      const pc = state.peers.get(sig.fromUserId);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(sig.data));
    } else if (sig.kind === "end") {
      removePeer(sig.fromUserId);
    } else if (sig.kind === "media") {
      state.remoteMedia = {
        ...state.remoteMedia,
        [sig.fromUserId]: { camera: !!sig.data?.camera, sharing: !!sig.data?.sharing },
      };
      notify();
    }
  } catch {
    // Out-of-order or stale signal — safe to drop.
  }
}

// Принимающая сторона: транссиверы появились из offer'а, берём сендеры оттуда.
// Созданные setRemoteDescription'ом видеотранссиверы по умолчанию только
// принимают — разворачиваем их на отправку, иначе камеру или экран с этой
// стороны включить было бы некуда.
function adoptTransceivers(pc) {
  const video = videoTransceivers(pc);
  video.forEach((t) => {
    if (t.direction !== "sendrecv") t.direction = "sendrecv";
  });
  pc._videoSender = video[0]?.sender ?? null;
  pc._camSender = video[1]?.sender ?? null;
  applyOutgoing(pc);
}

function removePeer(userId) {
  if (!state) return;
  const pc = state.peers.get(userId);
  if (pc) {
    pc.close();
    state.peers.delete(userId);
  }
  const { [userId]: _drop, ...restStreams } = state.remoteStreams;
  state.remoteStreams = restStreams;
  const { [userId]: _dropMedia, ...restMedia } = state.remoteMedia;
  state.remoteMedia = restMedia;
  const { [userId]: _dropCam, ...restCam } = state.remoteCamStreams;
  state.remoteCamStreams = restCam;
  state.others = state.others.filter((p) => p.id !== userId);
  notify();
  if (state.others.length === 0 && state.phase !== "ended") {
    endLocally();
  }
}

let unsubSignal = null;
let unsubUpdated = null;
let unsubParticipants = null;
let pollTimer = null;
let ticker = null;

async function join({ call, chatTitle, chatType, participants, me, isRoom = false }) {
  const others = participants.filter((p) => p.id !== me.id);
  state = {
    call,
    chatTitle,
    chatType,
    others,
    me,
    isRoom,
    phase: "ringing",
    elapsed: 0,
    // Таймер «никто не ответил» заводится вместе со звонком — см. armNoAnswerTimer.

    muted: false,
    cameraOn: call.kind === "video",
    facingBack: false,
    // Текст последней неудачи переворота — показывается на экране звонка.
    cameraError: null,
    // Сколько камер у устройства: кнопку переворота нет смысла показывать,
    // если камера одна. Заполняется асинхронно после старта.
    cameraCount: 1,
    sharing: false,
    // Своя демонстрация для предпросмотра — поток из одной дорожки экрана.
    screenStream: null,
    // Звук демонстрации, смешанный с микрофоном (startScreenAudio).
    screenAudio: null,
    // Что у собеседников с камерой и экраном: userId -> { camera, sharing }.
    remoteMedia: {},
    // Камера собеседника, пока он показывает экран: userId -> MediaStream.
    remoteCamStreams: {},
    minimized: false,
    localStream: null,
    mediaError: null,
    connectionError: null,
    remoteStreams: {},
    connectedPeers: {},
    peers: new Map(),
    offered: new Set(),
    mediaReadyPromise: null,
  };
  let resolveMediaReady;
  state.mediaReadyPromise = new Promise((resolve) => {
    resolveMediaReady = resolve;
  });
  notify();

  // Fresh TURN credentials for this call — awaited here, before signal
  // handlers below can trigger createPeer(), and well ahead of the
  // getUserMedia permission prompt that follows, so it adds no perceptible
  // delay.
  iceServers = await fetchIceServers();
  // Голосовая комната никого не вызывает — ни гудка, ни таймера "не ответили":
  // заходят туда сами, отвечать там некому.
  // Only the caller hears a ringback — the callee already decided to join by
  // clicking "Accept" (see incomingCallWatcher.js, which rings *before* that).
  if (!isRoom && call.callerId === me.id) startRingback();
  // Ждём ответа ограниченное время: не ответили — кладём трубку сами. Заводим
  // только у звонящего; у принимающего звонок и так либо соединится, либо
  // закончится по сигналу с той стороны.
  if (!isRoom && call.callerId === me.id) armNoAnswerTimer();

  ticker = setInterval(() => {
    if (state && state.phase === "connected") {
      state.elapsed++;
      notify();
    }
  }, 1000);

  // Signal handlers must be live *before* any offer/answer can arrive —
  // registering them after the (potentially slow, permission-prompting)
  // getUserMedia call risked missing the other side's first message.
  unsubSignal = onWsMessage("call:signal", (msg) => handleSignal(msg.signal));
  unsubUpdated = onWsMessage("call:updated", (msg) => {
    if (!state || msg.call.id !== state.call.id) return;
    if (msg.call.status !== "ongoing" && state.phase !== "ended") endLocally();
  });
  unsubParticipants = onWsMessage("call:participants-updated", async (msg) => {
    if (!state || msg.call.id !== state.call.id) return;
    const { members } = await api.getChat(state.call.chatId).catch(() => ({ members: [] }));
    // Вышедшие из группового звонка (POST /:id/leave) — их соединения
    // закрываем, а плитки убираем. Раньше этот список только рос.
    for (const o of state.others) {
      if (!msg.call.participantIds.includes(o.id)) removePeer(o.id);
    }
    if (!state) return;
    const newIds = msg.call.participantIds.filter((id) => id !== state.me.id && !state.others.some((o) => o.id === id));
    for (const id of newIds) {
      const user = members.find((m) => m.id === id);
      if (user) {
        state.others = [...state.others, user];
        notify();
        if (shouldOffer(id)) await offerTo(id);
      }
    }
  });

  // HTTP polling stays as a catch-up/fallback safety net alongside the WS push.
  let after = 0;
  pollTimer = setInterval(async () => {
    if (!state) return;
    const { signals } = await api.pollSignals(state.call.id, after).catch(() => ({ signals: [] }));
    for (const sig of signals) {
      after = Math.max(after, sig.seq);
      await handleSignal(sig);
    }
  }, 3000);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      // Раньше здесь стоял голый facingMode — то есть разрешение на усмотрение
      // браузера, а он по умолчанию берёт 640×480 при 30 кадрах. Просим 1080p60
      // (lib/mediaQuality.js), мягкими ideal-ограничениями: камера, которая так
      // не умеет, отдаст своё лучшее вместо отказа.
      video: call.kind === "video" ? cameraConstraints({ facingMode: "user" }) : false,
    });
    if (!state) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    state.localStream = stream;
    // Сколько камер у устройства — спрашиваем только теперь: до выдачи
    // разрешения браузер отдаёт список устройств без опознавательных знаков.
    cameraCount()
      .then((n) => {
        if (state) {
          state.cameraCount = n;
          notify();
        }
      })
      .catch(() => {});
  } catch {
    // No mic/camera permission (or no device) — the call still proceeds:
    // createPeer() negotiates recvonly so we can at least hear/see the other
    // side, and the caller must still send an offer regardless (below) or
    // the call would just sit there connecting nothing.
    if (state) state.mediaError = "Нет доступа к микрофону или камере — звук и видео от вас не передаются";
  }
  resolveMediaReady();
  notify();

  // The offer must go out whether or not local media was acquired — gating
  // this on getUserMedia succeeding was the bug that made calls "not really
  // ring": on any permission/device failure the offer was silently skipped.
  for (const p of others) {
    if (state && shouldOffer(p.id)) await offerTo(p.id);
  }
}

// Call participants are `call.participantIds`, not the full chat member list
// (group calls start with just the caller — see server/routes/calls.js).
// Anyone who joined via a Premium invite link (server/routes/calls.js's
// /join/:token) deliberately isn't added to the chat itself, so they won't
// be in `members` at all — fetch those individually so the original members
// still get them as a peer tile instead of silently dropping them.
async function resolveParticipants(call, members) {
  const resolved = await Promise.all(
    call.participantIds.map((id) => members.find((m) => m.id === id) ?? api.getUser(id).then((r) => r.user).catch(() => undefined))
  );
  return resolved.filter((m) => m !== undefined);
}

// ringAll — быстрый звонок в группе: вызываются сразу все её участники.
export async function placeCall(chatId, kind, me, { ringAll = false } = {}) {
  const { call } = await api.placeCall(chatId, kind, { ringAll });
  const { chat, members } = await api.getChat(chatId);
  const participants = await resolveParticipants(call, members);
  await join({ call, chatTitle: chat.title, chatType: chat.type, participants, me });
  navigate(`/call/${call.id}`);
}

export async function joinCallById(callId, me) {
  if (state && state.call.id === callId) return; // already joined (e.g. answered from notification)
  const { calls } = await api.listCalls();
  const call = calls.find((c) => c.id === callId);
  // "ongoing" is the only non-final status (see server/data/calls.js) — a
  // finished call still shows up in listCalls() for history, and the browser
  // Back button can land here on that same /call/:id URL after the call
  // already ended (see hangup()/endLocally() below, which now replace that
  // history entry — this check is the other half of the fix, for whoever
  // still has the old entry cached, or reaches this URL some other way).
  // Without it, this used to open a dead call: it'd send offers to a peer
  // who's long gone and just sit there, unconnectable, until closed by hand.
  if (!call || call.status !== "ongoing") return;
  let chatTitle = "Звонок";
  let chatType = "dm";
  let participants;
  try {
    const { chat, members } = await api.getChat(call.chatId);
    chatTitle = chat.title;
    chatType = chat.type;
    participants = await resolveParticipants(call, members);
  } catch {
    // Joined via a Premium invite link (server/routes/calls.js's
    // /join/:token) without being a member of the underlying chat — build
    // the roster from the call's own participants instead of the chat's
    // member list, which a non-member can't fetch. chatType stays "dm" (no
    // "add participant" capability) since an outsider shouldn't be adding
    // people to a group they aren't in.
    const users = await Promise.all(call.participantIds.map((id) => api.getUser(id).then((r) => r.user).catch(() => null)));
    participants = users.filter(Boolean);
  }
  await join({ call, chatTitle, chatType, participants, me });
}

// Войти в постоянную голосовую комнату группы (server/routes/calls.js's
// /room/:chatId/join) — комната заводится сама при первом входе, дальше
// каждый следующий просто подключается к идущей. В отличие от placeCall,
// никого не вызывает: isRoom отключает гудок и таймер "не ответили" в join().
export async function joinVoiceRoom(chatId, me) {
  if (state && state.call.chatId === chatId && state.isRoom) return; // уже внутри
  const { call } = await api.joinVoiceRoom(chatId);
  const { chat, members } = await api.getChat(chatId);
  const participants = await resolveParticipants(call, members);
  await join({ call, chatTitle: chat.title, chatType: chat.type, participants, me, isRoom: true });
  navigate(`/call/${call.id}`);
}

// Premium's "invite by link" (see server/routes/calls.js's /:id/invite-link)
// — returns a shareable URL that lets whoever opens it join this call's mesh
// even if they aren't a member of the underlying chat.
export async function createInviteLink() {
  if (!state) throw new Error("Нет активного звонка");
  const { url } = await api.createCallInviteLink(state.call.id);
  return url;
}

export function toggleMute() {
  if (!state) return;
  state.muted = !state.muted;
  state.localStream?.getAudioTracks().forEach((t) => (t.enabled = !state.muted));
  notify();
}

function flashCameraError(message) {
  state.cameraError = message;
  notify();
  setTimeout(() => {
    if (state && state.cameraError === message) {
      state.cameraError = null;
      notify();
    }
  }, 3000);
}

// Голосовой звонок — это тот же видеозвонок, только с выключенной камерой:
// включить её можно в любом звонке. Камера берётся при включении и
// отпускается при выключении (а не просто гасится), так что и лампочка на
// ноутбуке честно гаснет.
export async function toggleCamera() {
  if (!state) return;
  if (state.cameraOn) {
    state.cameraOn = false;
    const tracks = state.localStream?.getTracks() ?? [];
    tracks.filter((t) => t.kind === "video").forEach((t) => t.stop());
    // Новый объект потока, а не removeTrack: экран звонка сравнивает srcObject
    // по ссылке и иначе не заметил бы, что картинки больше нет.
    if (state.localStream) state.localStream = new MediaStream(tracks.filter((t) => t.kind !== "video"));
  } else {
    let track = null;
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: cameraConstraints({ facingMode: state.facingBack ? "environment" : "user" }),
      });
      track = cam.getVideoTracks()[0] ?? null;
    } catch {
      // Отказ в разрешении или камеры нет — ниже скажем об этом.
    }
    if (!state) {
      track?.stop();
      return;
    }
    if (!track) {
      flashCameraError("Нет доступа к камере");
      return;
    }
    state.localStream = new MediaStream([...(state.localStream?.getTracks() ?? []), track]);
    state.cameraOn = true;
    cameraCount()
      .then((n) => {
        if (state) {
          state.cameraCount = n;
          notify();
        }
      })
      .catch(() => {});
  }
  state.peers.forEach(applyOutgoing);
  broadcastMedia();
  notify();
}

// Переворот камеры. Вся возня с тем, как вообще получить вторую камеру, живёт
// в lib/cameraSwitch.js — здесь только замена дорожки в звонке. Во время
// демонстрации тоже работает: камера тогда уходит вторым потоком рядом с
// экраном (см. applyOutgoing).
export async function flipCamera() {
  if (!state) return;
  const oldTrack = state.localStream?.getVideoTracks()[0] ?? null;
  const { track: newTrack, error } = await getFlippedTrack({ currentTrack: oldTrack, wantBack: !state.facingBack, video: HD_VIDEO });
  if (!state) {
    newTrack?.stop();
    return;
  }
  if (!newTrack) {
    // Молчание было главной бедой прежней версии: кнопка нажималась, ничего не
    // происходило, и понять почему было нельзя.
    flashCameraError(error ?? "Не удалось переключить камеру");
    return;
  }

  state.facingBack = !state.facingBack;
  state.cameraError = null;
  oldTrack?.stop();
  const rest = state.localStream?.getTracks().filter((t) => t !== oldTrack) ?? [];
  state.localStream = new MediaStream([...rest, newTrack]);
  state.peers.forEach(applyOutgoing);
  notify();
}

// Звук демонстрации подмешивается к микрофону в одну дорожку.
//
// Отдельной звуковой дорожки под экран в соединении нет, а добавить её посреди
// звонка нельзя — пересогласования здесь нет (см. applyOutgoing). Смешанная
// дорожка встаёт в тот же звуковой сендер вместо микрофона. Выключение
// микрофона продолжает работать: выключенная дорожка даёт в смесь тишину, а
// звук экрана идёт дальше.
function startScreenAudio(track) {
  if (!track) return;
  try {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const mic = state.localStream?.getAudioTracks()[0];
    if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(dest);
    ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
    ctx.resume?.().catch(() => {});
    state.screenAudio = { ctx, track, mixed: dest.stream.getAudioTracks()[0] };
  } catch {
    // Нет Web Audio — показ продолжится без звука.
    track.stop();
  }
}

function stopScreenAudio() {
  const a = state?.screenAudio;
  if (!a) return;
  a.track.stop();
  a.mixed?.stop();
  a.ctx.close().catch(() => {});
  state.screenAudio = null;
}

// Real getDisplayMedia screen-share (the original app only toggled a UI flag).
// Экран встаёт в основной видеосендер, камера — во второй, звук экрана
// смешивается с микрофоном.
export async function toggleScreenShare() {
  if (!state) return;
  if (!state.sharing) {
    let display;
    try {
      display = await navigator.mediaDevices.getDisplayMedia(HD_SCREEN);
    } catch {
      // User cancelled the screen picker or the browser denied it.
      return;
    }
    const screenTrack = display.getVideoTracks()[0];
    if (!screenTrack || !state) {
      display.getTracks().forEach((t) => t.stop());
      return;
    }
    hintScreenTrack(screenTrack);
    state.screenTrack = screenTrack;
    state.screenStream = new MediaStream([screenTrack]);
    startScreenAudio(display.getAudioTracks()[0] ?? null);
    // Показ остановили кнопкой браузера («Закрыть доступ»), а не нашей.
    screenTrack.onended = () => {
      if (state?.screenTrack === screenTrack) toggleScreenShare();
    };
    state.sharing = true;
  } else {
    state.screenTrack?.stop();
    state.screenTrack = null;
    state.screenStream = null;
    stopScreenAudio();
    state.sharing = false;
  }
  state.peers.forEach(applyOutgoing);
  broadcastMedia();
  notify();
}

export async function addParticipant(userId) {
  if (!state) return;
  await api.addCallParticipant(state.call.id, userId);
}

export function minimize() {
  if (!state) return;
  state.minimized = true;
  notify();
}

export function restore() {
  if (!state) return;
  state.minimized = false;
  notify();
  navigate(`/call/${state.call.id}`);
}

function cleanupSubscriptions() {
  clearInterval(ticker);
  clearInterval(pollTimer);
  unsubSignal?.();
  unsubUpdated?.();
  unsubParticipants?.();
}

// Local-only teardown (remote end, all peers left) — doesn't re-notify peers.
function endLocally() {
  if (!state) return;
  const chatId = state.call?.chatId ?? null;
  const wasOnCallScreen = window.location.pathname.startsWith(`/call/${state.call?.id ?? ""}`);
  state.phase = "ended";
  stopRingtone();
  state.peers.forEach((pc) => pc.close());
  state.peers.clear();
  state.localStream?.getTracks().forEach((t) => t.stop());
  state.screenTrack?.stop();
  stopScreenAudio();
  cleanupSubscriptions();
  notify();
  setTimeout(() => {
    state = null;
    notify();
    // Уводим с экрана звонка — так же, как это делает hangup() у того, кто
    // положил трубку сам. Раньше здесь этого не было: у второй стороны звонок
    // заканчивался, а экран с ним оставался на месте, и выйти можно было
    // только через «назад». Секунда на надпись «Звонок завершён» — и в чат.
    // replace, not push — otherwise the just-ended call's /call/:id URL stays
    // one Back-press away, and pressing Back would try to rejoin a call that
    // no longer exists (see joinCallById's status guard for the other half).
    if (wasOnCallScreen && chatId) navigate(`/chat/${chatId}`, { replace: true });
  }, 600);
}

// Сколько ждать ответа, прежде чем положить трубку самому.
//
// Без этого звонок звонил вечно: не ответили — а он всё «идёт», занимая
// микрофон у звонящего и оставаясь в базе активным. Сорок пять секунд — это
// примерно семь гудков, столько же ждёт обычный телефон.
const NO_ANSWER_MS = 45 * 1000;
let noAnswerTimer = null;

function armNoAnswerTimer() {
  clearTimeout(noAnswerTimer);
  noAnswerTimer = setTimeout(() => {
    // Ответили — таймер уже не нужен, разговор идёт своим чередом.
    if (!state || state.phase !== "ringing") return;
    hangup();
  }, NO_ANSWER_MS);
}

export async function hangup() {
  clearTimeout(noAnswerTimer);
  if (!state) return;
  const { call, others, elapsed } = state;
  // Разговор состоялся или нет — разные записи в журнале.
  //
  // Раньше отсюда всегда уходило «completed», даже когда трубку сбросили на
  // первом гудке. В журнале это выглядело как состоявшийся звонок нулевой
  // длины, и отличить «не дозвонился» от «поговорили» было нельзя.
  //
  // Считается до того, как фаза сменится на "ended" ниже: раньше проверка
  // стояла после, и каждый звонок записывался как пропущенный.
  const answered = state.phase === "connected";
  others.forEach((p) => sendSignal(p.id, "end", null));
  state.phase = "ended";
  stopRingtone();
  notify();
  const chatId = call.chatId;
  // Групповой звонок, в котором кто-то уже ответил, — выходим сами, остальные
  // продолжают. Завершить его целиком (PATCH ниже) значит оборвать разговор
  // всем из-за одного положившего трубку.
  const leaveOnly = !state.isRoom && state.chatType === "group" && (answered || call.callerId !== state.me.id);
  if (leaveOnly) {
    await api.leaveCall(call.id).catch(() => {});
  } else if (state.isRoom) {
    // Кто-то один вышел из комнаты — она не заканчивается для остальных
    // (в отличие от обычного PATCH статуса ниже, который завершил бы её у
    // всех). server/routes/calls.js's /room/:chatId/leave сам решает, гасить
    // ли комнату целиком, если это был последний.
    await api.leaveVoiceRoom(chatId).catch(() => {});
  } else {
    await api
      .patchCall(call.id, { status: answered ? "completed" : "missed", durationSec: answered ? elapsed : 0 })
      .catch(() => {});
  }
  cleanupSubscriptions();
  state.peers.forEach((pc) => pc.close());
  state.localStream?.getTracks().forEach((t) => t.stop());
  state.screenTrack?.stop();
  stopScreenAudio();
  state = null;
  notify();
  // Same reasoning as endLocally() above: replace, so the ended call's
  // /call/:id entry doesn't linger in history for Back to return to.
  navigate(`/chat/${chatId}`, { replace: true });
}

// В групповом звонке «Отклонить» — это «я не приду», а не «звонок отменён»:
// остальные вызванные могли уже ответить и разговаривать.
export async function decline(call) {
  if ((call.participantIds?.length ?? 0) > 2) {
    await api.leaveCall(call.id).catch(() => {});
    return;
  }
  await api.patchCall(call.id, { status: "declined" }).catch(() => {});
}

export function getCurrentUser() {
  return getAppState().user;
}
