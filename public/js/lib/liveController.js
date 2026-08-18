import { api } from "../api.js";
import { wsSend, onWsMessage, isWsOpen } from "./wsClient.js";
import { getState } from "../state.js";

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
    participants: state.participants,
    messages: state.messages,
    me: state.me,
    myRole: state.myRole,
    localStream: state.localStream,
    remoteStreams: state.remoteStreams,
    micOn: state.micOn,
    camOn: state.camOn,
    error: state.error,
  };
}

const publishes = (role) => role === "host" || role === "speaker";

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
  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
  } else {
    // Зритель не отправляет ничего, но обязан явно попросить приём — иначе
    // предложение уйдёт пустым и в эфире будет тишина при живом соединении.
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.addTransceiver("video", { direction: "recvonly" });
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
      const pc = state.peers.get(from) ?? createPeer(from);
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
  const wantVideo = state.myRole === "host" && state.stream.withVideo;
  const wantAudio = publishes(state.myRole);
  if (!wantAudio && !wantVideo) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: wantAudio, video: wantVideo });
  } catch (err) {
    state.error = wantVideo ? "Нет доступа к камере или микрофону" : "Нет доступа к микрофону";
    return null;
  }
}

function stopLocalMedia() {
  state.localStream?.getTracks().forEach((t) => t.stop());
  state.localStream = null;
}

// Пересобрать своё вещание — при получении или потере слова. Проще и надёжнее
// перезаключить соединения, чем добавлять дорожки к уже согласованным: цена —
// секунда переподключения ровно у того, кому дали слово.
async function refreshPublishing() {
  stopLocalMedia();
  for (const id of [...state.peers.keys()]) dropPeer(id);
  state.localStream = await acquireMedia();
  applyMuteFlags();
  await connectAll();
  notify();
}

function applyMuteFlags() {
  const mine = state.participants.find((p) => p.userId === state.me.id);
  const forcedMute = !!mine?.mutedByHost;
  state.localStream?.getAudioTracks().forEach((t) => (t.enabled = state.micOn && !forcedMute));
  state.localStream?.getVideoTracks().forEach((t) => (t.enabled = state.camOn));
}

async function connectAll() {
  for (const p of state.participants) {
    if (p.userId === state.me.id) continue;
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
    micOn: true,
    camOn: true,
    error: null,
    unsubs: [],
  };

  const data = await api.joinLive(streamId);
  state.stream = data.stream;
  state.participants = data.participants;
  state.messages = data.messages;
  state.myRole = data.participants.find((p) => p.userId === me.id)?.role ?? "viewer";
  state.localStream = await acquireMedia();
  applyMuteFlags();

  state.unsubs.push(onWsMessage("live:signal", handleSignal));
  state.unsubs.push(
    onWsMessage("live:state", async (msg) => {
      if (!state || msg.streamId !== state.stream.id) return;
      try {
        await applyState(await api.getLive(state.stream.id));
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

export async function stopLive() {
  if (!state) return;
  const id = state.stream.id;
  await api.stopLive(id).catch(() => {});
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
