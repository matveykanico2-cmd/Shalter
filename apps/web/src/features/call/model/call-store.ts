// Звонок — как public/js/lib/callController.js: один на вкладку, живёт вне экранов
// (свернулся в пузырь — разговор идёт). WebRTC «каждый с каждым», сигналы по сокету,
// HTTP — запасной путь (опрос раз в секунду). У каждого пира два видеоканала: основной
// (камера или экран) и второй — камера, пока показывают экран.
import { ws } from "@/shared/api";
import { cameraCount, getFlippedTrack } from "@/shared/lib/media/camera-switch";
import { CALL_AUDIO, cameraConstraints, getUserMediaSafe, HD_SCREEN, HD_VIDEO, hintScreenTrack, hintVideoTrack, isMobileUa, mediaQuality, tuneOpusSdp, tuneVideoSender } from "@/shared/lib/media/media-quality";
import { startRingback, stopRingtone } from "@/shared/lib/media/sounds";

import { type Call, callApi, type CallKind, type CallPeer, type Signal } from "../api/call-api";

export type CallPhase = "ringing" | "connected" | "ended";
export type PeerMedia = { camera: boolean; sharing: boolean; handRaised?: boolean };
export type CallConnectionStatus = "connecting" | "connected" | "reconnecting" | "failed";

/** Снимок звонка для экранов (useCall). */
export type CallState = {
  call: Call;
  chatTitle: string;
  chatType: string;
  others: CallPeer[];
  me: CallPeer;
  /** Голосовой чат группы. */
  isRoom: boolean;
  /** Вошли по приглашению: выход удаляет только нас и не завершает разговор. */
  joinedByLink: boolean;
  phase: CallPhase;
  elapsed: number;
  muted: boolean;
  cameraOn: boolean;
  facingBack: boolean;
  switchingCamera: boolean;
  cameraError: string | null;
  cameraCount: number;
  sharing: boolean;
  handRaised: boolean;
  screenStream: MediaStream | null;
  remoteMedia: Record<string, PeerMedia>;
  remoteStreams: Record<string, MediaStream>;
  /** Камера того, кто показывает экран (второй видеоканал). */
  remoteCamStreams: Record<string, MediaStream>;
  connectedPeers: Record<string, boolean>;
  minimized: boolean;
  localStream: MediaStream | null;
  mediaError: string | null;
  connectionError: string | null;
  connectionStatus: CallConnectionStatus;
};

type State = CallState & {
  peers: Map<string, RTCPeerConnection>;
  offered: Set<string>;
  mediaReady: Promise<void>;
  screenTrack: MediaStreamTrack | null;
  screenAudio: { ctx: AudioContext; track: MediaStreamTrack; mixed: MediaStreamTrack | undefined } | null;
  /** Сигналы приходят и по сокету, и опросом — второй раз не применяем. */
  handled: Set<string>;
  pendingIce: Map<string, RTCIceCandidateInit[]>;
  pageExitHandled: boolean;
};

const STUN_FALLBACK: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const ICE_FAILURE_MESSAGE = "Не удалось установить соединение — проверьте сеть и попробуйте позвонить снова";
// Через TURN и мобильную сеть ICE сходится и за 10–15 с: раньше 20 с не трогаем, иначе
// перезапуск ICE обрывает почти готовое соединение (8 с/4 с из main2 рвали такие звонки).
const CONNECT_TIMEOUT_MS = 20_000;
const RESTART_GRACE_MS = 10_000;
const MAX_ICE_RESTARTS = 3;
const NO_ANSWER_MS = 45_000;
const POLL_MS = 1000;
const QUALITY_POLL_MS = 3000;
const POOR_NETWORK_LOSS = 0.08;
const POOR_NETWORK_RTT = 0.4;

let iceServers = STUN_FALLBACK;
let state: State | null = null;
let snapshot: CallState | null = null;
const listeners = new Set<() => void>();
// Отправители по пиру: основной видеоканал, второй (камера при показе экрана), звук.
const senders = new WeakMap<RTCPeerConnection, { video: RTCRtpSender | null; cam: RTCRtpSender | null; audio: RTCRtpSender | null }>();
let cleanups: (() => void)[] = [];
let noAnswerTimer: ReturnType<typeof setTimeout> | undefined;
let joining: { callId: string; done: Promise<void> } | null = null;

function notify() {
  snapshot = state ? { ...state } : null;
  listeners.forEach((fn) => fn());
}

export function subscribeCall(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Тот же объект, пока звонок не изменился (для useSyncExternalStore). */
export const getCall = (): CallState | null => snapshot;

function sendSignal(toUserId: string, kind: string, data: unknown) {
  if (!state) return;
  if (ws.isOpen()) ws.send({ type: "call:signal:send", callId: state.call.id, toUserId, kind, data });
  else callApi.sendSignal(state.call.id, toUserId, kind, data).catch(() => {});
}

function applyOutgoing(pc: RTCPeerConnection) {
  if (!state) return;
  const s = senders.get(pc);
  if (!s) return;
  const cam = state.cameraOn ? (state.localStream?.getVideoTracks()[0] ?? null) : null;
  const main = state.sharing ? state.screenTrack : cam;
  const second = state.sharing ? cam : null;
  const audio = state.screenAudio?.mixed ?? state.localStream?.getAudioTracks()[0] ?? null;
  const put = (sender: RTCRtpSender | null, track: MediaStreamTrack | null, opts: { screen?: boolean }) => {
    if (!sender || sender.track === track) return;
    sender
      .replaceTrack(track)
      .then(() => tuneVideoSender(sender, opts))
      .catch(() => {});
  };
  put(s.video, main, { screen: state.sharing });
  put(s.cam, second, {});
  put(s.audio, audio, {});
}

/**
 * Потолки битрейта и кадров на всех видеоотправителях пира. Кодировки появляются только
 * после согласования, а дорожка, добавленная addTrack, через replaceTrack не проходит —
 * поэтому настраиваем после каждого setLocalDescription и когда соединились.
 */
function tunePeer(pc: RTCPeerConnection) {
  const s = senders.get(pc);
  if (!s || !state) return;
  void tuneVideoSender(s.video, { screen: state.sharing });
  void tuneVideoSender(s.cam);
}

function sendMedia(userId: string) {
  if (state) sendSignal(userId, "media", { camera: state.cameraOn, sharing: state.sharing, handRaised: state.handRaised });
}

const broadcastMedia = () => state?.others.forEach((p) => sendMedia(p.id));

function videoTransceivers(pc: RTCPeerConnection) {
  return pc
    .getTransceivers()
    .filter((t) => t.mid != null && t.receiver.track.kind === "video")
    .sort((a, b) => Number(a.mid) - Number(b.mid));
}

function createPeer(otherUserId: string, { answering = false } = {}) {
  const s = state!;
  const pc = new RTCPeerConnection({ iceServers });
  const own = { video: null as RTCRtpSender | null, cam: null as RTCRtpSender | null, audio: null as RTCRtpSender | null };
  senders.set(pc, own);
  if (s.localStream) {
    const local = s.localStream;
    local.getTracks().forEach((t) => pc.addTrack(t, local));
    own.audio = pc.getSenders().find((x) => x.track?.kind === "audio") ?? null;
  }
  if (!answering) {
    if (!own.audio) pc.addTransceiver("audio", { direction: "recvonly" });
    const cam = s.localStream?.getVideoTracks()[0] ?? null;
    own.video = cam ? (pc.getSenders().find((x) => x.track === cam) ?? null) : pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    own.cam = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    applyOutgoing(pc);
  }
  sendMedia(otherUserId);

  let restartAttempts = 0;
  let iceRestartPending = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let previousPackets = { received: 0, lost: 0 };
  const clearWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = undefined;
  };
  const setStatus = (status: CallConnectionStatus) => {
    if (!state || state.peers.get(otherUserId) !== pc) return;
    state.connectionStatus = status;
    if (status !== "failed") state.connectionError = null;
  };
  const armWatchdog = (delay = CONNECT_TIMEOUT_MS) => {
    clearWatchdog();
    watchdog = setTimeout(handleStuck, delay);
  };
  function handleStuck() {
    if (!state || pc.connectionState === "connected" || pc.connectionState === "closed") return;
    if (!pc.currentRemoteDescription) {
      setStatus("connecting");
      armWatchdog(CONNECT_TIMEOUT_MS);
      notify();
      return;
    }
    if (restartAttempts < MAX_ICE_RESTARTS) {
      restartAttempts += 1;
      setStatus("reconnecting");
      try {
        pc.restartIce();
        // Не полагаемся только на onnegotiationneeded: Safari и некоторые WebViews
        // после restartIce() не вызывают его, поэтому явно отправляем offer с ICE restart.
        // После оборванного offer signaling state может остаться
        // have-local-offer. Сначала откатываем незавершённые переговоры, затем
        // отправляем ровно один новый offer с ICE restart.
        iceRestartPending = false;
        void restartOffer(otherUserId);
      } catch {
        // Старый браузер без restartIce.
      }
      armWatchdog(RESTART_GRACE_MS * restartAttempts);
      notify();
      return;
    }
    setStatus("failed");
    state.connectionError = ICE_FAILURE_MESSAGE;
    stopRingtone();
    notify();
  }
  armWatchdog();

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal(otherUserId, "ice", e.candidate.toJSON());
  };
  // restartIce() ставит перезапуск в очередь, но offer с новыми ICE-данными уходит только отсюда.
  pc.onnegotiationneeded = () => {
    if (!iceRestartPending || pc.signalingState !== "stable") return;
    if (state?.peers.get(otherUserId) !== pc) return;
    iceRestartPending = false;
    void renegotiate(otherUserId, true);
  };
  pc.ontrack = (e) => {
    if (!state) return;
    const track = e.track;
    if (track.kind === "video" && videoTransceivers(pc).indexOf(e.transceiver) > 0) {
      state.remoteCamStreams = { ...state.remoteCamStreams, [otherUserId]: new MediaStream([track]) };
    } else {
      const prev = state.remoteStreams[otherUserId]?.getTracks().filter((t) => t.kind !== track.kind) ?? [];
      state.remoteStreams = { ...state.remoteStreams, [otherUserId]: new MediaStream([...prev, track]) };
    }
    notify();
  };
  const looksConnected = () => pc.connectionState === "connected" || pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";
  const onStateChange = () => {
    if (!state) return;
    state.connectedPeers = { ...state.connectedPeers, [otherUserId]: looksConnected() };
    if (looksConnected()) {
      clearWatchdog();
      // После восстановления новый сетевой обрыв получает полный запас попыток.
      restartAttempts = 0;
      iceRestartPending = false;
      setStatus("connected");
      tunePeer(pc);
      if (state.phase === "ringing") {
        state.phase = "connected";
        stopRingtone();
      }
    } else {
      setStatus("reconnecting");
      armWatchdog(pc.connectionState === "failed" || pc.iceConnectionState === "failed" ? 0 : CONNECT_TIMEOUT_MS);
    }
    notify();
  };
  const sampleQuality = async () => {
    if (!state || state.peers.get(otherUserId) !== pc || typeof pc.getStats !== "function") return;
    try {
      const stats = await pc.getStats();
      let received = 0;
      let lost = 0;
      let rtt = 0;
      for (const report of stats.values()) {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          received += Number(report.packetsReceived) || 0;
          lost += Number(report.packetsLost) || 0;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded") rtt = Math.max(rtt, Number(report.currentRoundTripTime) || 0);
      }
      const packetDelta = received + lost - previousPackets.received - previousPackets.lost;
      const loss = packetDelta > 0 ? Math.max(0, lost - previousPackets.lost) / packetDelta : 0;
      previousPackets = { received, lost };
      const degraded = loss >= POOR_NETWORK_LOSS || rtt >= POOR_NETWORK_RTT;
      const base = mediaQuality(isMobileUa(navigator.userAgent)).videoBitrate;
      const target = state.sharing ? (degraded ? 1_500_000 : 8_000_000) : degraded ? Math.min(base, 700_000) : base;
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind !== "video" || typeof sender.getParameters !== "function") continue;
        const params = sender.getParameters();
        const encoding = params.encodings?.[0];
        if (!encoding || encoding.maxBitrate === target) continue;
        encoding.maxBitrate = target;
        await sender.setParameters(params).catch(() => {});
      }
    } catch {
      // Некоторые WebViews не дают статистику — соединение продолжает работать без адаптации.
    }
  };
  const qualityTimer = setInterval(() => void sampleQuality(), QUALITY_POLL_MS);
  cleanups.push(() => clearInterval(qualityTimer));
  pc.onconnectionstatechange = onStateChange;
  pc.oniceconnectionstatechange = onStateChange;
  s.peers.set(otherUserId, pc);
  return pc;
}

// Кто шлёт offer: звонящий — всем, остальные — тем, у кого id меньше (без встречных offer).
function shouldOffer(userId: string) {
  const s = state!;
  if (s.me.id === s.call.callerId) return true;
  if (userId === s.call.callerId) return false;
  return s.me.id > userId;
}

async function renegotiate(userId: string, iceRestart = false): Promise<boolean> {
  const pc = state?.peers.get(userId);
  if (!pc || pc.signalingState !== "stable") return false;
  try {
    const offer = tuneOpusSdp(await pc.createOffer(iceRestart ? { iceRestart: true } : undefined));
    await pc.setLocalDescription(offer);
    sendSignal(userId, "offer", offer);
    tunePeer(pc);
    return true;
  } catch {
    // Пир уже закрыт.
    return false;
  }
}

async function restartOffer(userId: string): Promise<boolean> {
  const pc = state?.peers.get(userId);
  if (!pc) return false;
  try {
    if (pc.signalingState !== "stable") await pc.setLocalDescription({ type: "rollback" });
  } catch {
    return false;
  }
  return renegotiate(userId, true);
}

async function offerTo(userId: string) {
  if (!state || state.offered.has(userId)) return;
  state.offered.add(userId);
  const pc = state.peers.get(userId) ?? createPeer(userId);
  try {
    const offer = tuneOpusSdp(await pc.createOffer());
    await pc.setLocalDescription(offer);
    sendSignal(userId, "offer", offer);
    tunePeer(pc);
  } catch {
    // Пир закрыт, пока готовили offer.
  }
}

function adoptTransceivers(pc: RTCPeerConnection) {
  const video = videoTransceivers(pc);
  video.forEach((t) => {
    if (t.direction !== "sendrecv") t.direction = "sendrecv";
  });
  const own = senders.get(pc);
  if (own) {
    own.video = video[0]?.sender ?? null;
    own.cam = video[1]?.sender ?? null;
  }
  applyOutgoing(pc);
}

async function flushIce(owner: State, userId: string, pc: RTCPeerConnection) {
  const candidates = owner.pendingIce.get(userId) ?? [];
  owner.pendingIce.delete(userId);
  for (const candidate of candidates) {
    if (state !== owner || owner.peers.get(userId) !== pc) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* Устаревший кандидат. */ }
  }
}

async function handleSignal(sig: Signal) {
  if (!state || sig.callId !== state.call.id || state.handled.has(sig.id)) return;
  const owner = state;
  state.handled.add(sig.id);
  const data = sig.data as never;
  try {
    if (sig.kind === "offer") {
      await state.mediaReady;
      if (state !== owner) return;
      const pc = state.peers.get(sig.fromUserId) ?? createPeer(sig.fromUserId, { answering: true });
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      await flushIce(owner, sig.fromUserId, pc);
      if (state !== owner) return;
      adoptTransceivers(pc);
      const answer = tuneOpusSdp(await pc.createAnswer());
      await pc.setLocalDescription(answer);
      sendSignal(sig.fromUserId, "answer", answer);
      tunePeer(pc);
    } else if (sig.kind === "answer") {
      const pc = state.peers.get(sig.fromUserId);
      await pc?.setRemoteDescription(new RTCSessionDescription(data));
      if (pc) {
        await flushIce(owner, sig.fromUserId, pc);
        tunePeer(pc);
      }
      // Ответ SDP означает, что собеседник уже принял звонок. Медиа может ещё
      // договариваться через TURN, но выход после этого должен быть completed,
      // а не missed.
      if (state.phase === "ringing") {
        state.phase = "connected";
        state.connectionStatus = "connecting";
        clearTimeout(noAnswerTimer);
        stopRingtone();
        notify();
      }
    } else if (sig.kind === "ice") {
      const pc = state.peers.get(sig.fromUserId);
      if (!pc?.remoteDescription) {
        const pending = owner.pendingIce.get(sig.fromUserId) ?? [];
        pending.push(sig.data as RTCIceCandidateInit);
        owner.pendingIce.set(sig.fromUserId, pending);
      } else await pc.addIceCandidate(new RTCIceCandidate(data));
    } else if (sig.kind === "end") {
      removePeer(sig.fromUserId);
    } else if (sig.kind === "media") {
      const media = sig.data as Partial<PeerMedia> | null;
      state.remoteMedia = { ...state.remoteMedia, [sig.fromUserId]: { camera: !!media?.camera, sharing: !!media?.sharing, handRaised: !!media?.handRaised } };
      notify();
    } else if (sig.kind === "accepted") {
      // Ответивший клиент подтверждает принятие сразу, не дожидаясь ICE/медиа.
      // Это не заменяет WebRTC negotiation, а не даёт pagehide ошибочно пометить
      // уже принятый звонок как missed при медленном TURN.
      if (state.phase === "ringing") {
        state.phase = "connected";
        state.connectionStatus = "connecting";
        clearTimeout(noAnswerTimer);
        stopRingtone();
        notify();
      }
    }
  } catch {
    // Устаревший или битый сигнал — пропускаем.
  }
}

function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k as K))) as Omit<T, K>;
}

const without = <T>(map: Record<string, T>, key: string) => omit(map, [key]);

function removePeer(userId: string) {
  if (!state) return;
  state.pendingIce.delete(userId);
  const pc = state.peers.get(userId);
  if (pc) {
    pc.close();
    state.peers.delete(userId);
  }
  state.remoteStreams = without(state.remoteStreams, userId);
  state.remoteMedia = without(state.remoteMedia, userId);
  state.remoteCamStreams = without(state.remoteCamStreams, userId);
  state.others = state.others.filter((p) => p.id !== userId);
  notify();
  // Последний собеседник ушёл — звонок окончен. В голосовом чате группы остаются ждать
  // других: раньше клиент закрывал его у себя, а сервер продолжал считать участником.
  // Не завершаем сразу — даём времени другому участнику присоединиться.
  if (state.others.length === 0 && !state.isRoom && !state.joinedByLink && state.phase !== "ended" && state.phase === "connected") {
    clearTimeout(noAnswerTimer);
    noAnswerTimer = setTimeout(() => {
      if (state && state.others.length === 0 && !state.isRoom && state.phase !== "ended") endLocally();
    }, 15000);
  } else if (state.others.length === 0 && !state.isRoom && state.phase === "ringing") {
    // Don't auto-end while ringing, wait for server to update
    clearTimeout(noAnswerTimer);
  }
}

type JoinInput = { call: Call; chatTitle: string | null; chatType: string; participants: CallPeer[]; me: CallPeer; isRoom?: boolean; joinedByLink?: boolean; accepted?: boolean; canStart?: () => boolean };

async function join({ call, chatTitle, chatType, participants, me, isRoom = false, joinedByLink = false, accepted = false, canStart }: JoinInput) {
  if (canStart && !canStart()) return;
  const others = participants.filter((p) => p.id !== me.id);
  // Новый звонок поверх старого (ответили на другой) — старый отпускает микрофон и пиров.
  if (state) release(state);
  let markReady!: () => void;
  const mediaReady = new Promise<void>((resolve) => (markReady = resolve));
  state = {
    call,
    // У лички своего названия нет — подписываем звонок именем собеседника.
    chatTitle: chatTitle || (chatType === "dm" ? (others[0]?.name ?? "") : ""),
    chatType,
    others,
    me,
    isRoom,
    joinedByLink,
    phase: "ringing",
    elapsed: 0,
    muted: false,
    cameraOn: call.kind === "video",
    facingBack: false,
    switchingCamera: false,
    cameraError: null,
    cameraCount: 1,
    sharing: false,
    handRaised: false,
    screenStream: null,
    screenTrack: null,
    screenAudio: null,
    remoteMedia: {},
    remoteStreams: {},
    remoteCamStreams: {},
    connectedPeers: {},
    minimized: false,
    localStream: null,
    mediaError: null,
    connectionError: null,
    connectionStatus: "connecting",
    peers: new Map(),
    offered: new Set(),
    mediaReady,
    handled: new Set(),
    pendingIce: new Map(),
    pageExitHandled: false,
  };
  const mine = state;
  notify();

  // ICE-конфигурация и разрешение микрофона не зависят друг от друга — начинаем оба запроса
  // сразу, чтобы медленный TURN/прокси не задерживал показ экрана звонка.
  const icePromise = callApi.iceServers().then(
    ({ iceServers: list }) => (Array.isArray(list) && list.length ? list : STUN_FALLBACK),
    () => STUN_FALLBACK
  );
  const outgoing = !isRoom && call.callerId === me.id;
  if (outgoing) {
    startRingback();
    clearTimeout(noAnswerTimer);
    noAnswerTimer = setTimeout(() => {
      if (state === mine && mine.phase === "ringing") void hangup();
    }, NO_ANSWER_MS);
  } else {
    clearTimeout(noAnswerTimer);
  }

  // Таймер берём от общего времени создания звонка, а не от момента запуска
  // этого конкретного клиента. Иначе участники, ответившие с разницей в секунду,
  // видят разные значения и в группе расхождение постоянно растёт.
  const callStartedAt = Date.parse(call.startedAt);
  const ticker = setInterval(() => {
    if (state?.phase === "connected") {
      const sharedElapsed = Number.isFinite(callStartedAt) ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)) : state.elapsed + 1;
      if (state.elapsed !== sharedElapsed) {
        state.elapsed = sharedElapsed;
        notify();
      }
    }
  }, 1000);
  let after = 0;
  const poll = setInterval(() => {
    if (!state) return;
    void callApi.pollSignals(state.call.id, after).then(
      async ({ signals }) => {
        for (const sig of signals) {
          after = Math.max(after, sig.seq);
          await handleSignal(sig);
        }
      },
      () => {}
    );
  }, POLL_MS);
  const onPageExit = () => {
    if (state !== mine || mine.pageExitHandled || mine.phase === "ended") return;
    mine.pageExitHandled = true;
    const answered = mine.phase === "connected";
    const leaveOnly = mine.joinedByLink || mine.isRoom || (mine.chatType === "group" && (answered || mine.call.callerId !== mine.me.id));
    if (leaveOnly) {
      if (mine.isRoom) callApi.leaveRoomOnPageExit(mine.call.chatId);
      else callApi.leaveOnPageExit(mine.call.id);
    } else {
      // При закрытии страницы PATCH часто обрывается браузером. POST /leave
      // отправляется через sendBeacon и гарантированно убирает пользователя
      // из звонка, а сервер сам завершает звонок, если участников больше нет.
      callApi.leaveOnPageExit(mine.call.id);
    }
    release(mine);
    if (state === mine) {
      state = null;
      snapshot = null;
      notify();
    }
  };
  const onPageHide = (event: PageTransitionEvent) => {
    // Back/forward can put the document into bfcache. Keep the call alive there.
    if (event.persisted) return;
    onPageExit();
  };
  const onOffline = () => {
    if (state !== mine || mine.phase === "ended") return;
    mine.connectionStatus = "reconnecting";
    mine.connectionError = null;
    notify();
  };
  const onOnline = () => {
    if (state !== mine || mine.phase === "ended") return;
    mine.connectionStatus = "reconnecting";
    mine.connectionError = null;
    notify();
    for (const [userId, pc] of mine.peers) {
      if (pc.connectionState === "connected" || pc.connectionState === "closed") continue;
      try { pc.restartIce(); } catch { /* Старые WebView не умеют restartIce. */ }
      void restartOffer(userId);
    }
    void syncCallAfterReconnect(mine);
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageExit);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  cleanups = [
    () => window.removeEventListener("pagehide", onPageHide),
    () => window.removeEventListener("beforeunload", onPageExit),
    () => window.removeEventListener("offline", onOffline),
    () => window.removeEventListener("online", onOnline),
    () => clearInterval(ticker),
    () => clearInterval(poll),
    ws.on("call:signal", (msg) => void handleSignal(msg.signal)),
    ws.on("call:answered", (msg) => {
      if (state !== mine || msg.callId !== mine.call.id || mine.phase !== "ringing") return;
      mine.phase = "connected";
      stopRingtone();
      notify();
    }),
    ws.on("ws:reconnected", () => {
      if (state === mine) void syncCallAfterReconnect(mine);
    }),
    ws.on("call:updated", (msg) => {
      if (state && msg.call.id === state.call.id && msg.call.status !== "ongoing" && state.phase !== "ended") endLocally();
    }),
    ws.on("call:participants-updated", (msg) => void onParticipants(msg.call)),
  ];
  if (accepted) others.forEach((p) => sendSignal(p.id, "accepted", null));

  try {
    const stream = await getUserMediaSafe({
      audio: CALL_AUDIO,
      video: call.kind === "video" ? cameraConstraints({ facingMode: "user" }) : false,
    });
    if (state !== mine) {
      stream.getTracks().forEach((t) => t.stop());
      markReady();
      return;
    }
    hintVideoTrack(stream.getVideoTracks()[0], "motion");
    mine.localStream = stream;
    void refreshCameraCount();
  } catch {
    if (state === mine) mine.mediaError = "Нет доступа к микрофону или камере — звук и видео от вас не передаются";
  }
  iceServers = await icePromise;
  if (state !== mine) return;
  markReady();
  notify();
  for (const p of others) {
    if (state === mine && shouldOffer(p.id)) await offerTo(p.id);
  }
}

/** События о завершении могли прийти, пока сокет переподключался. */
async function syncCallAfterReconnect(owner: State) {
  const { calls } = await callApi.list().catch(() => ({ calls: [] as Array<{ id: string; status: string; participantIds: string[] }> }));
  if (state !== owner) return;
  const current = calls.find((call) => call.id === owner.call.id);
  if (!current || current.status !== "ongoing") {
    endLocally();
    return;
  }
  const changed = current.participantIds.length !== owner.call.participantIds.length || current.participantIds.some((id) => !owner.call.participantIds.includes(id));
  if (changed) {
    owner.call = current as Call;
    await onParticipants(current as Call);
  }
}

async function onParticipants(call: Call) {
  if (!state || call.id !== state.call.id) return;
  const { members } = await callApi.chat(state.call.chatId).catch(() => ({ members: [] as CallPeer[] }));
  for (const o of state.others) {
    if (!call.participantIds.includes(o.id)) removePeer(o.id);
  }
  if (!state) return;
  const fresh = call.participantIds.filter((id) => id !== state!.me.id && !state!.others.some((o) => o.id === id));
  for (const id of fresh) {
    const user = members.find((m) => m.id === id);
    if (!user || !state) continue;
    state.others = [...state.others, user];
    notify();
    if (shouldOffer(id)) await offerTo(id);
  }
}

function refreshCameraCount() {
  return cameraCount()
    .then((n) => {
      if (!state) return;
      state.cameraCount = n;
      notify();
    })
    .catch(() => {});
}

async function resolveParticipants(call: Call, members: CallPeer[]) {
  const resolved = await Promise.all(
    call.participantIds.map((id) => members.find((m) => m.id === id) ?? callApi.user(id).then((r) => r.user, () => undefined))
  );
  return resolved.filter((m): m is CallPeer => m !== undefined);
}

const peerOf = (me: CallPeer): CallPeer => ({ id: me.id, name: me.name, avatarColor: me.avatarColor, avatarImage: me.avatarImage });

/** Позвонить в чат; ringAll — в группе звонят всем. Возвращает id звонка для экрана /call/:id. */
export async function placeCall(chatId: string, kind: CallKind, me: CallPeer, { ringAll = false, inviteOnly = false }: { ringAll?: boolean; inviteOnly?: boolean } = {}) {
  const [{ call }, { chat, members }] = await Promise.all([callApi.place(chatId, kind, ringAll, inviteOnly), callApi.chat(chatId)]);
  const participants = await resolveParticipants(call, members);
  await join({ call, chatTitle: chat.title, chatType: chat.type, participants, me: peerOf(me) });
  return call.id;
}

/** Войти в идущий звонок. Ответ на входящий выполняется только явно. */
type JoinCallOptions = { answer?: boolean; canStart?: () => boolean };

export function joinCallById(callId: string, me: CallPeer, { answer = false, canStart = () => true }: JoinCallOptions = {}): Promise<void> {
  if (!canStart()) return Promise.resolve();
  if (state?.call.id === callId) return Promise.resolve();
  if (joining?.callId === callId) {
    const pending = joining.done;
    return pending.then(() => {
      if (!canStart() || state?.call.id === callId) return;
      return joinCallById(callId, me, { answer, canStart });
    });
  }
  const done = (async () => {
    const { calls } = await callApi.list();
    const found = calls.find((c) => c.id === callId);
    if (!found || found.status !== "ongoing") return;
    if (!canStart()) return;
    const answerRequest = answer && found.callerId !== me.id && found.kind !== "voice-room" ? callApi.answer(callId) : Promise.resolve();
    // Строка истории: направление и собеседник — не часть звонка.
    const call = omit(found, ["direction", "otherUser", "group", "answered"]);
    let chatTitle: string | null = "Звонок";
    let chatType = "dm";
    let participants: CallPeer[];
    try {
      const [{ chat, members }] = await Promise.all([callApi.chat(call.chatId), answerRequest]);
      chatTitle = chat.title;
      chatType = chat.type;
      participants = await resolveParticipants(call, members);
    } catch {
      const users = await Promise.all(call.participantIds.map((id) => callApi.user(id).then((r) => r.user, () => null)));
      participants = users.filter((u): u is CallPeer => !!u);
    }
    if (!canStart()) return;
    await join({ call, chatTitle, chatType, participants, me: peerOf(me), accepted: answer, canStart });
  })().finally(() => {
    if (joining?.done === done) joining = null;
  });
  joining = { callId, done };
  return done;
}

/** Вход по ссылке: участник может закрыть экран и выйти, не завершая звонок остальных. */
export function joinCallByLink(token: string, me: CallPeer): Promise<void> {
  if (joining?.callId === `link:${token}`) return joining.done;
  const done = (async () => {
    const { call } = await callApi.joinByLink(token);
    const { chat, members } = await callApi.chat(call.chatId);
    const participants = await resolveParticipants(call, members);
    await join({ call, chatTitle: chat.title, chatType: chat.type, participants, me: peerOf(me), joinedByLink: true });
  })().finally(() => {
    if (joining?.done === done) joining = null;
  });
  joining = { callId: `link:${token}`, done };
  return done;
}

/** Голосовой чат группы: войти (или начать). */
export async function joinVoiceRoom(chatId: string, me: CallPeer) {
  if (state?.isRoom && state.call.chatId === chatId) return state.call.id;
  const { call } = await callApi.joinRoom(chatId);
  const { chat, members } = await callApi.chat(chatId);
  const participants = await resolveParticipants(call, members);
  await join({ call, chatTitle: chat.title, chatType: chat.type, participants, me: peerOf(me), isRoom: true });
  return call.id;
}

export async function createInviteLink() {
  if (!state || state.phase === "ended") throw new Error("Звонок уже завершён");
  return (await callApi.inviteLink(state.call.id)).url;
}

export async function addParticipant(userId: string) {
  if (state) await callApi.addParticipant(state.call.id, userId);
}

export function toggleMute() {
  if (!state) return;
  const muted = !state.muted;
  state.muted = muted;
  state.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  notify();
}

/** Поднять/опустить руку и сообщить состояние всем участникам звонка. */
export function toggleHand() {
  if (!state) return;
  state.handRaised = !state.handRaised;
  broadcastMedia();
  notify();
}

function flashCameraError(message: string) {
  if (!state) return;
  state.cameraError = message;
  notify();
  setTimeout(() => {
    if (state?.cameraError !== message) return;
    state.cameraError = null;
    notify();
  }, 3000);
}

export async function toggleCamera() {
  if (!state) return;
  if (state.cameraOn) {
    state.cameraOn = false;
    const tracks = state.localStream?.getTracks() ?? [];
    tracks.filter((t) => t.kind === "video").forEach((t) => t.stop());
    if (state.localStream) state.localStream = new MediaStream(tracks.filter((t) => t.kind !== "video"));
  } else {
    let track: MediaStreamTrack | null = null;
    try {
      const cam = await getUserMediaSafe({ video: cameraConstraints({ facingMode: state.facingBack ? "environment" : "user" }) });
      track = cam.getVideoTracks()[0] ?? null;
      hintVideoTrack(track, "motion");
    } catch {
      // Ниже — «Нет доступа к камере».
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
    void refreshCameraCount();
  }
  state.peers.forEach(applyOutgoing);
  broadcastMedia();
  notify();
}

export async function flipCamera() {
  if (!state || state.switchingCamera) return;
  const oldTrack = state.localStream?.getVideoTracks()[0] ?? null;
  state.switchingCamera = true;
  notify();
  const { track: newTrack, error } = await getFlippedTrack({ currentTrack: oldTrack, wantBack: !state.facingBack, video: HD_VIDEO });
  if (!state) {
    newTrack?.stop();
    return;
  }
  state.switchingCamera = false;
  if (!newTrack) {
    flashCameraError(error ?? "Не удалось переключить камеру");
    return;
  }
  hintVideoTrack(newTrack, "motion");
  state.facingBack = !state.facingBack;
  state.cameraError = null;
  // Меняем трек внутри того же потока: <video> не перезагружается и не мигает чёрным.
  if (state.localStream) {
    state.localStream.addTrack(newTrack);
    if (oldTrack) state.localStream.removeTrack(oldTrack);
  } else {
    state.localStream = new MediaStream([newTrack]);
  }
  state.peers.forEach(applyOutgoing);
  oldTrack?.stop();
  notify();
}

// Звук вкладки при показе экрана смешивается с микрофоном в одну дорожку.
function startScreenAudio(s: State, track: MediaStreamTrack | null) {
  if (!track) return;
  try {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const mic = s.localStream?.getAudioTracks()[0];
    if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(dest);
    ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
    ctx.resume().catch(() => {});
    s.screenAudio = { ctx, track, mixed: dest.stream.getAudioTracks()[0] };
  } catch {
    track.stop();
  }
}

function stopScreenAudio(s: State) {
  const a = s.screenAudio;
  if (!a) return;
  a.track.stop();
  a.mixed?.stop();
  a.ctx.close().catch(() => {});
  s.screenAudio = null;
}

export async function toggleScreenShare() {
  if (!state) return;
  if (!state.sharing) {
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia(HD_SCREEN);
    } catch {
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
    startScreenAudio(state, display.getAudioTracks()[0] ?? null);
    // «Остановить показ» в панели браузера.
    screenTrack.onended = () => {
      if (state?.screenTrack === screenTrack) void toggleScreenShare();
    };
    state.sharing = true;
  } else {
    state.screenTrack?.stop();
    state.screenTrack = null;
    state.screenStream = null;
    stopScreenAudio(state);
    state.sharing = false;
  }
  state.peers.forEach(applyOutgoing);
  broadcastMedia();
  notify();
}

/** Ушли с экрана звонка — он свернулся в пузырь. */
export function minimize() {
  if (!state || state.minimized || state.phase === "ended") return;
  state.minimized = true;
  notify();
}

/** Экран звонка снова открыт. */
export function unminimize() {
  if (!state?.minimized) return;
  state.minimized = false;
  notify();
}

function release(s: State) {
  clearTimeout(noAnswerTimer);
  cleanups.forEach((fn) => fn());
  cleanups = [];
  s.peers.forEach((pc) => pc.close());
  s.peers.clear();
  s.localStream?.getTracks().forEach((t) => t.stop());
  s.screenTrack?.stop();
  stopScreenAudio(s);
}

// Звонок закончился не по нашей кнопке: «Звонок завершён» на мгновение, потом экран уходит.
function endLocally() {
  const s = state;
  if (!s) return;
  s.phase = "ended";
  stopRingtone();
  release(s);
  notify();
  setTimeout(() => {
    if (state !== s) return;
    state = null;
    notify();
  }, 600);
}

/** Положить трубку. Возвращает чат звонка — туда уходит экран. */
export async function hangup(): Promise<string | null> {
  clearTimeout(noAnswerTimer);
  const s = state;
  if (!s) return null;
  const { call, others, elapsed } = s;
  const answered = s.phase === "connected";
  // Встреча и вход по ссылке — это выход одного участника. Не посылаем остальным
  // сигнал завершения, иначе уход одного человека мог сбросить разговор у всех.
  if (!s.isRoom && !s.joinedByLink) others.forEach((p) => sendSignal(p.id, "end", null));
  s.phase = "ended";
  stopRingtone();
  notify();
  // Из группового звонка уходят, а не завершают его за всех.
  const leaveOnly = s.joinedByLink || (!s.isRoom && s.chatType === "group" && (answered || call.callerId !== s.me.id));
  if (leaveOnly) await callApi.leave(call.id, s.joinedByLink).catch(() => {});
  else if (s.isRoom) await callApi.leaveRoom(call.chatId).catch(() => {});
  else await callApi.patch(call.id, { status: answered ? "completed" : "missed", durationSec: answered ? elapsed : 0 }).catch(() => {});
  release(s);
  if (state === s) {
    state = null;
    notify();
  }
  return call.chatId;
}

/** Отклонить входящий; из группового (больше двух) — только выйти. */
export async function decline(call: { id: string; participantIds?: string[] }) {
  if ((call.participantIds?.length ?? 0) > 2) await callApi.leave(call.id).catch(() => {});
  else await callApi.patch(call.id, { status: "declined" }).catch(() => {});
}
