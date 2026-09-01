import { api } from "../api.js";
import { getFlippedTrack, cameraCount } from "./cameraSwitch.js";
import { HD_VIDEO, HD_SCREEN, cameraConstraints, tunePeerVideo, hintScreenTrack } from "./mediaQuality.js";
import { getState as getAppState } from "../state.js";
import { onWsMessage, wsSend, isWsOpen } from "./wsClient.js";
import { navigate } from "../router.js";
import { startRingback, stopRingtone } from "./ringtone.js";

// Public STUN-only ICE traversal fails across restrictive/symmetric NATs —
// added a public TURN relay (Open Relay Project demo credentials) so calls
// actually connect on real-world networks. This is a shared/free relay, fine
// for getting calls working now; swap for a dedicated TURN server (e.g.
// self-hosted coturn) before relying on this for production privacy/scale.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443"],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

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

function createPeer(otherUserId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
    // Битрейт и «чем жертвовать при нехватке канала» задаются на сендере, а не
    // на дорожке, и сбрасываются вместе с соединением — поэтому здесь, на
    // каждом новом peer, а не один раз при получении камеры.
    tunePeerVideo(pc, { screen: state.sharing });
  } else {
    // No local mic/camera (denied permission or no device) — still negotiate
    // recvonly so the *other* side's audio/video reaches us. Without this,
    // a failed getUserMedia would silently skip the offer entirely and the
    // call would just sit there connecting nothing (the bug this fixes).
    pc.addTransceiver("audio", { direction: "recvonly" });
    if (state.call.kind === "video") pc.addTransceiver("video", { direction: "recvonly" });
  }

  let restarted = false;
  function handleStuck() {
    if (!state || pc.connectionState === "connected" || pc.connectionState === "closed") return;
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
  pc.ontrack = (e) => {
    state.remoteStreams = { ...state.remoteStreams, [otherUserId]: e.streams[0] };
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
      const pc = state.peers.get(sig.fromUserId) ?? createPeer(sig.fromUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
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
    }
  } catch {
    // Out-of-order or stale signal — safe to drop.
  }
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

async function join({ call, chatTitle, chatType, participants, me }) {
  const others = participants.filter((p) => p.id !== me.id);
  state = {
    call,
    chatTitle,
    chatType,
    others,
    me,
    phase: "ringing",
    elapsed: 0,
    muted: false,
    cameraOn: call.kind === "video",
    facingBack: false,
    // Текст последней неудачи переворота — показывается на экране звонка.
    cameraError: null,
    // Сколько камер у устройства: кнопку переворота нет смысла показывать,
    // если камера одна. Заполняется асинхронно после старта.
    cameraCount: 1,
    sharing: false,
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
  // Only the caller hears a ringback — the callee already decided to join by
  // clicking "Accept" (see incomingCallWatcher.js, which rings *before* that).
  if (call.callerId === me.id) startRingback();

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
    const newIds = msg.call.participantIds.filter((id) => id !== state.me.id && !state.others.some((o) => o.id === id));
    for (const id of newIds) {
      const user = members.find((m) => m.id === id);
      if (user) {
        state.others = [...state.others, user];
        notify();
        await offerTo(id);
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
  if (call.callerId === me.id) {
    for (const p of others) await offerTo(p.id);
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

export async function placeCall(chatId, kind, me) {
  const { call } = await api.placeCall(chatId, kind);
  const { chat, members } = await api.getChat(chatId);
  const participants = await resolveParticipants(call, members);
  await join({ call, chatTitle: chat.title, chatType: chat.type, participants, me });
  navigate(`/call/${call.id}`);
}

export async function joinCallById(callId, me) {
  if (state && state.call.id === callId) return; // already joined (e.g. answered from notification)
  const { calls } = await api.listCalls();
  const call = calls.find((c) => c.id === callId);
  if (!call) return;
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

export function toggleCamera() {
  if (!state) return;
  state.cameraOn = !state.cameraOn;
  state.localStream?.getVideoTracks().forEach((t) => (t.enabled = state.cameraOn));
  notify();
}

// Переворот камеры. Вся возня с тем, как вообще получить вторую камеру, живёт
// в lib/cameraSwitch.js — здесь только замена дорожки в звонке.
export async function flipCamera() {
  if (!state) return;
  // Во время демонстрации экрана переворачивать нечего: собеседники видят экран,
  // и подмена дорожки у отправителя просто оборвала бы показ.
  if (state.sharing) {
    state.cameraError = "Сначала остановите показ экрана";
    notify();
    return;
  }

  const oldTrack = state.localStream?.getVideoTracks()[0] ?? null;
  const { track: newTrack, error } = await getFlippedTrack({ currentTrack: oldTrack, wantBack: !state.facingBack, video: HD_VIDEO });
  if (!newTrack) {
    // Молчание было главной бедой прежней версии: кнопка нажималась, ничего не
    // происходило, и понять почему было нельзя.
    state.cameraError = error ?? "Не удалось переключить камеру";
    notify();
    setTimeout(() => {
      if (state) {
        state.cameraError = null;
        notify();
      }
    }, 3000);
    return;
  }

  state.facingBack = !state.facingBack;
  state.cameraError = null;
  // Выключенная камера должна остаться выключенной: новая дорожка приходит
  // включённой, и без этой строки переворот сам собой включал видео.
  newTrack.enabled = state.cameraOn;

  if (oldTrack && state.localStream) {
    state.localStream.removeTrack(oldTrack);
    oldTrack.stop();
  }
  state.localStream?.addTrack(newTrack);
  state.cameraTrack = newTrack;
  state.peers.forEach((pc) => {
    pc.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(newTrack);
    tunePeerVideo(pc);
  });
  notify();
}

// Real getDisplayMedia screen-share (the original app only toggled a UI flag).
// Swaps the outgoing video track the same way flipCamera does.
export async function toggleScreenShare() {
  if (!state) return;
  if (!state.sharing) {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia(HD_SCREEN);
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) return;
      hintScreenTrack(screenTrack);
      state.screenTrack = screenTrack;
      state.cameraTrack = state.localStream?.getVideoTracks()[0] ?? null;
      state.peers.forEach((pc) => {
        pc.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(screenTrack);
        // У экрана свой профиль: 60 кадров важнее чёткости, иначе прокрутка и
        // игра превращаются в слайд-шоу.
        tunePeerVideo(pc, { screen: true });
      });
      screenTrack.onended = () => toggleScreenShare();
      state.sharing = true;
      notify();
    } catch {
      // User cancelled the screen picker or the browser denied it.
    }
  } else {
    const revertTrack = state.cameraTrack;
    if (revertTrack) {
      state.peers.forEach((pc) => {
        pc.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(revertTrack);
        tunePeerVideo(pc);
      });
    }
    state.screenTrack?.stop();
    state.screenTrack = null;
    state.sharing = false;
    notify();
  }
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
  cleanupSubscriptions();
  notify();
  setTimeout(() => {
    state = null;
    notify();
    // Уводим с экрана звонка — так же, как это делает hangup() у того, кто
    // положил трубку сам. Раньше здесь этого не было: у второй стороны звонок
    // заканчивался, а экран с ним оставался на месте, и выйти можно было
    // только через «назад». Секунда на надпись «Звонок завершён» — и в чат.
    if (wasOnCallScreen && chatId) navigate(`/chat/${chatId}`);
  }, 600);
}

export async function hangup() {
  if (!state) return;
  const { call, others, elapsed } = state;
  others.forEach((p) => sendSignal(p.id, "end", null));
  state.phase = "ended";
  stopRingtone();
  notify();
  await api.patchCall(call.id, { status: "completed", durationSec: elapsed }).catch(() => {});
  const chatId = call.chatId;
  cleanupSubscriptions();
  state.peers.forEach((pc) => pc.close());
  state.localStream?.getTracks().forEach((t) => t.stop());
  state = null;
  notify();
  navigate(`/chat/${chatId}`);
}

export async function decline(call) {
  await api.patchCall(call.id, { status: "declined" }).catch(() => {});
}

export function getCurrentUser() {
  return getAppState().user;
}
