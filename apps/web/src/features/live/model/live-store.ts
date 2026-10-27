// Эфир — как public/js/lib/liveController.js и openLiveScreen: один на вкладку, экран эфира
// поверх приложения. Из браузера — WebRTC: ведущий и выступающие шлют звук и видео всем,
// зрители только принимают; сигналы по сокету (live:signal). Эфир из OBS смотрят потоком
// FLV с сервера, без WebRTC.
import { ws } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { cameraConstraints, HD_SCREEN, hintScreenTrack, tuneVideoSender } from "@/shared/lib/media/media-quality";

import { liveApi, type LiveMessage, type LiveParticipant, type LiveRole, type LiveSource, type LiveStateBody, type LiveStream } from "../api/live-api";

/** Снимок эфира для экрана. */
export type LiveView = {
  stream: LiveStream;
  /** Эфир из OBS — поток с сервера. */
  flvUrl: string | null;
  ingest: LiveStateBody["ingest"];
  participants: LiveParticipant[];
  messages: LiveMessage[];
  meId: string;
  myRole: LiveRole;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  canShare: boolean;
  error: string | null;
};

/** Открытый экран эфира: он остаётся с «Эфир завершён», когда сам эфир уже закончился. */
export type LiveScreenInfo = { streamId: string; chatTitle: string | null; canStopStream: boolean; joining: boolean; error: string | null };

export type LiveSnapshot = {
  live: LiveView | null;
  screen: LiveScreenInfo | null;
  /** «Начать эфир» — выбор: из браузера или через OBS. */
  asking: { chatId: string; chatTitle: string | null; meId: string } | null;
};

type State = {
  meId: string;
  stream: LiveStream | { id: string; source?: undefined; withVideo?: undefined; status?: undefined };
  ingest: LiveStateBody["ingest"];
  participants: LiveParticipant[];
  messages: LiveMessage[];
  myRole: LiveRole;
  peers: Map<string, RTCPeerConnection>;
  remoteStreams: Record<string, MediaStream>;
  localStream: MediaStream | null;
  camStream: MediaStream | null;
  screenTrack: MediaStreamTrack | null;
  sharing: boolean;
  micOn: boolean;
  camOn: boolean;
  error: string | null;
  unsubs: (() => void)[];
  /** Вошли, камера и микрофон получены — можно отвечать на offer. */
  ready: Promise<void>;
};

const STUN_FALLBACK: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

let iceServers = STUN_FALLBACK;
let state: State | null = null;
let screen: LiveScreenInfo | null = null;
let asking: LiveSnapshot["asking"] = null;
let snapshot: LiveSnapshot = { live: null, screen: null, asking: null };
const listeners = new Set<() => void>();

const isRtmp = () => state?.stream.source === "rtmp";
const publishes = (role: LiveRole) => !isRtmp() && (role === "host" || role === "speaker");

function view(): LiveView | null {
  const s = state;
  if (!s || !s.stream.status) return null;
  return {
    stream: s.stream as LiveStream,
    flvUrl: isRtmp() ? `/api/live/${s.stream.id}/feed.flv` : null,
    ingest: s.ingest,
    participants: s.participants,
    messages: s.messages,
    meId: s.meId,
    myRole: s.myRole,
    localStream: s.localStream,
    remoteStreams: s.remoteStreams,
    micOn: s.micOn,
    camOn: s.camOn,
    sharing: s.sharing,
    canShare: publishes(s.myRole),
    error: s.error,
  };
}

function notify() {
  snapshot = { live: view(), screen, asking };
  listeners.forEach((fn) => fn());
}

export function subscribeLive(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Тот же объект, пока ничего не изменилось (для useSyncExternalStore). */
export const getLive = (): LiveSnapshot => snapshot;

function sendSignal(toUserId: string, kind: string, data: unknown) {
  if (state && ws.isOpen()) ws.send({ type: "live:signal:send", streamId: state.stream.id, toUserId, kind, data });
}

function shouldOffer(otherRole: LiveRole, otherId: string) {
  const s = state!;
  if (!publishes(s.myRole)) return false;
  if (!publishes(otherRole)) return true;
  return s.meId < otherId;
}

function createPeer(otherUserId: string) {
  const s = state!;
  const pc = new RTCPeerConnection({ iceServers });
  const sending = new Set<string>();
  const local = s.localStream;
  if (local) {
    local.getTracks().forEach((t) => {
      pc.addTrack(t, local);
      sending.add(t.kind);
    });
    pc.getSenders().forEach((sender) => void tuneVideoSender(sender, { screen: s.sharing }));
  }
  for (const kind of ["audio", "video"]) {
    if (!sending.has(kind)) pc.addTransceiver(kind, { direction: "recvonly" });
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(otherUserId, "ice", e.candidate.toJSON());
  };
  pc.ontrack = (e) => {
    if (!state || state.peers.get(otherUserId) !== pc) return;
    const prev = state.remoteStreams[otherUserId]?.getTracks().filter((t) => t.kind !== e.track.kind) ?? [];
    state.remoteStreams = { ...state.remoteStreams, [otherUserId]: e.streams[0] ?? new MediaStream([...prev, e.track]) };
    notify();
  };
  s.peers.set(otherUserId, pc);
  return pc;
}

async function offerTo(userId: string) {
  if (!state) return;
  const pc = state.peers.get(userId) ?? createPeer(userId);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(userId, "offer", offer);
  } catch {
    // Пир закрыт, пока готовили offer.
  }
}

function dropPeer(userId: string) {
  if (!state) return;
  const pc = state.peers.get(userId);
  if (pc) {
    pc.close();
    state.peers.delete(userId);
  }
  if (state.remoteStreams[userId]) {
    state.remoteStreams = Object.fromEntries(Object.entries(state.remoteStreams).filter(([id]) => id !== userId));
  }
}

async function handleSignal(msg: { streamId: string; fromUserId: string; kind: string; data: unknown }) {
  const s = state;
  if (!s || msg.streamId !== s.stream.id) return;
  await s.ready;
  if (state !== s) return;
  const from = msg.fromUserId;
  const data = msg.data as never;
  try {
    if (msg.kind === "offer") {
      const existing = state.peers.get(from);
      if (existing) {
        // Встречные offer: уступает тот, у кого id больше.
        if (existing.signalingState !== "stable" && state.meId < from) return;
        dropPeer(from);
      }
      const pc = createPeer(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(from, "answer", answer);
    } else if (msg.kind === "answer") {
      const pc = state.peers.get(from);
      if (pc && pc.signalingState !== "stable") await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (msg.kind === "ice") {
      await state.peers.get(from)?.addIceCandidate(new RTCIceCandidate(data));
    }
  } catch {
    // Устаревший или битый сигнал — пропускаем.
  }
}

async function acquireMedia(): Promise<MediaStream | null> {
  const s = state!;
  if (isRtmp() || !publishes(s.myRole)) return null;
  const wantVideo = !!s.stream.withVideo;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo ? cameraConstraints() : false });
  } catch {
    s.error = wantVideo ? "Нет доступа к камере или микрофону" : "Нет доступа к микрофону";
    return null;
  }
}

function composeLocalStream() {
  const s = state!;
  const out = new MediaStream();
  s.camStream?.getAudioTracks().forEach((t) => out.addTrack(t));
  const video = s.screenTrack ?? s.camStream?.getVideoTracks()[0] ?? null;
  if (video) out.addTrack(video);
  s.localStream = out.getTracks().length ? out : null;
}

function stopScreen() {
  const s = state!;
  if (!s.screenTrack) return;
  s.screenTrack.onended = null;
  s.screenTrack.stop();
  s.screenTrack = null;
  s.sharing = false;
}

function stopLocalMedia() {
  const s = state!;
  s.camStream?.getTracks().forEach((t) => t.stop());
  s.camStream = null;
  stopScreen();
  s.localStream = null;
}

function applyMuteFlags() {
  const s = state!;
  const forcedMute = !!s.participants.find((p) => p.userId === s.meId)?.mutedByHost;
  s.localStream?.getAudioTracks().forEach((t) => (t.enabled = s.micOn && !forcedMute));
  s.localStream?.getVideoTracks().forEach((t) => (t.enabled = t === s.screenTrack ? true : s.camOn));
}

async function republish() {
  const s = state;
  if (!s) return;
  for (const id of [...s.peers.keys()]) dropPeer(id);
  composeLocalStream();
  applyMuteFlags();
  for (const p of s.participants) {
    if (state === s && p.userId !== s.meId) await offerTo(p.userId);
  }
  notify();
}

async function refreshPublishing() {
  const s = state!;
  stopLocalMedia();
  for (const id of [...s.peers.keys()]) dropPeer(id);
  const media = await acquireMedia();
  if (state !== s) {
    media?.getTracks().forEach((t) => t.stop());
    return;
  }
  s.camStream = media;
  await republish();
}

async function connectAll() {
  const s = state;
  if (!s) return;
  for (const p of s.participants) {
    if (p.userId === s.meId) continue;
    const existing = s.peers.get(p.userId);
    if (existing && (existing.connectionState === "failed" || existing.connectionState === "closed")) dropPeer(p.userId);
    else if (existing) continue;
    if (state === s && shouldOffer(p.role, p.userId)) await offerTo(p.userId);
  }
}

const roleOf = (participants: LiveParticipant[], meId: string): LiveRole => participants.find((p) => p.userId === meId)?.role ?? "viewer";

async function applyState(data: LiveStateBody) {
  const s = state!;
  const prevRole = s.myRole;
  s.stream = data.stream;
  if (data.ingest) s.ingest = data.ingest;
  s.participants = data.participants;
  s.messages = data.messages;
  s.myRole = roleOf(data.participants, s.meId);

  const present = new Set(data.participants.map((p) => p.userId));
  for (const id of [...s.peers.keys()]) if (!present.has(id)) dropPeer(id);

  if (s.myRole !== prevRole) {
    // Зрителю дали слово — сначала только микрофон.
    if (prevRole === "viewer" && s.myRole === "speaker") s.camOn = false;
    await refreshPublishing();
    return;
  }
  applyMuteFlags();
  await connectAll();
  notify();
}

async function joinLive(streamId: string, meId: string) {
  if (state?.stream.id === streamId) return;
  if (state) await leaveLive();

  let markReady!: () => void;
  const s: State = {
    meId,
    stream: { id: streamId },
    ingest: null,
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
    error: null,
    unsubs: [],
    ready: new Promise<void>((resolve) => (markReady = resolve)),
  };
  state = s;
  // Сигналы — сразу: ведущий шлёт offer, как только мы вошли, а камера и ICE ещё не готовы
  // (раньше такой offer терялся и зритель видел чёрный экран). Ждут готовности в handleSignal.
  s.unsubs.push(ws.on("live:signal", (msg) => void handleSignal(msg)));

  try {
    const data = await liveApi.join(streamId);
    if (state !== s) return;
    s.stream = data.stream;
    s.ingest = data.ingest;
    s.participants = data.participants;
    s.messages = data.messages;
    s.myRole = roleOf(data.participants, meId);
  } catch (err) {
    if (state === s) {
      s.unsubs.forEach((u) => u());
      state = null;
    }
    throw err;
  }
  iceServers = await liveApi.iceServers().then(
    ({ iceServers: list }) => (Array.isArray(list) && list.length ? list : STUN_FALLBACK),
    () => STUN_FALLBACK
  );
  if (state !== s) return;
  const media = await acquireMedia();
  if (state !== s) {
    media?.getTracks().forEach((t) => t.stop());
    return;
  }
  s.camStream = media;
  composeLocalStream();
  applyMuteFlags();
  markReady();

  const mine = (msg: { streamId: string }) => state === s && msg.streamId === s.stream.id;
  s.unsubs.push(
    ws.on("live:state", (msg) => {
      if (!mine(msg)) return;
      void liveApi.get(streamId).then(
        (next) => (state === s ? applyState(next) : undefined),
        () => {}
      );
    }),
    ws.on("live:message", (msg) => {
      if (!mine(msg)) return;
      s.messages = [...s.messages, msg.message];
      notify();
    }),
    ws.on("live:message-updated", (msg) => {
      if (!mine(msg)) return;
      s.messages = s.messages.map((m) => (m.id === msg.message.id ? msg.message : m));
      notify();
    }),
    ws.on("live:message-deleted", (msg) => {
      if (!mine(msg)) return;
      s.messages = s.messages.filter((m) => m.id !== msg.messageId);
      notify();
    }),
    ws.on("live:ended", (msg) => {
      if (mine(msg)) teardown();
    })
  );

  await connectAll();
  notify();
}

function teardown() {
  const s = state;
  if (!s) return;
  s.unsubs.forEach((u) => u());
  for (const id of [...s.peers.keys()]) dropPeer(id);
  stopLocalMedia();
  state = null;
  notify();
}

/** Открыть экран эфира и войти в него. */
export function openLive(streamId: string, meId: string, { chatTitle = null, canStopStream = false }: { chatTitle?: string | null; canStopStream?: boolean } = {}) {
  screen = { streamId, chatTitle, canStopStream, joining: true, error: null };
  notify();
  const settle = (error: string | null) => {
    if (screen?.streamId !== streamId) return;
    screen = { ...screen, joining: false, error };
    notify();
  };
  joinLive(streamId, meId).then(
    () => settle(null),
    (err: unknown) => settle(errorText(err, "Не удалось войти в эфир"))
  );
}

/** Закрыть экран эфира (когда эфира уже нет). */
export function closeLive() {
  screen = null;
  notify();
}

export async function leaveLive() {
  const s = state;
  if (!s) return;
  teardown();
  await liveApi.leave(s.stream.id).catch(() => {});
}

/** Завершить эфир для всех. */
export async function stopLive() {
  const s = state;
  if (!s) return;
  await liveApi.stop(s.stream.id);
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

export async function toggleScreenShare() {
  const s = state;
  if (!s || !publishes(s.myRole)) return;
  if (s.sharing) {
    stopScreen();
    await republish();
    return;
  }
  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({ ...HD_SCREEN, audio: false });
  } catch {
    return;
  }
  const track = display.getVideoTracks()[0];
  if (!track || state !== s) {
    display.getTracks().forEach((t) => t.stop());
    return;
  }
  hintScreenTrack(track);
  s.screenTrack = track;
  s.sharing = true;
  // «Остановить показ» в панели браузера.
  track.onended = () => {
    if (state !== s || !s.sharing) return;
    stopScreen();
    void republish();
  };
  await republish();
}

/** «Начать эфир» в меню чата — спросить, откуда вещать. */
export function askLiveSource(chatId: string, chatTitle: string | null, meId: string) {
  asking = { chatId, chatTitle, meId };
  notify();
}

export function cancelLiveSource() {
  asking = null;
  notify();
}

export type LiveAsk = NonNullable<LiveSnapshot["asking"]>;

/** Начать эфир в чате и открыть его экран. */
export async function startLive({ chatId, chatTitle, meId }: LiveAsk, source: LiveSource) {
  const { stream } = await liveApi.start(chatId, { title: chatTitle, withVideo: true, source });
  openLive(stream.id, meId, { chatTitle });
}
