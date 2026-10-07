import { api } from "../api.js";
import { getFlippedTrack, cameraCount } from "./cameraSwitch.js";
import { HD_VIDEO, HD_SCREEN, CALL_AUDIO, cameraConstraints, tuneVideoSender, hintScreenTrack, tuneOpusSdp } from "./mediaQuality.js";
import { getState as getAppState } from "../state.js";
import { onWsMessage, wsSend, isWsOpen } from "./wsClient.js";
import { navigate } from "../router.js";
import { startRingback, stopRingtone } from "./ringtone.js";
import { fetchIceServers } from "./iceServers.js";

let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

let state = null;
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
const CONNECT_TIMEOUT_MS = 20000;
const RESTART_GRACE_MS = 10000;

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
  put(pc._audioSender, audio, {});
}

function broadcastMedia() {
  state.others.forEach((p) => sendMedia(p.id));
}

function sendMedia(userId) {
  sendSignal(userId, "media", { camera: !!state.cameraOn, sharing: !!state.sharing });
}

function videoTransceivers(pc) {
  return pc
    .getTransceivers()
    .filter((t) => t.mid != null && t.receiver.track.kind === "video")
    .sort((a, b) => Number(a.mid) - Number(b.mid));
}

function createPeer(otherUserId, { answering = false } = {}) {
  const pc = new RTCPeerConnection({ iceServers });
  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => pc.addTrack(t, state.localStream));
    pc._audioSender = pc.getSenders().find((s) => s.track?.kind === "audio") ?? null;
  }
  if (!answering) {
    if (!pc._audioSender) pc.addTransceiver("audio", { direction: "recvonly" });
    const cam = state.localStream?.getVideoTracks()[0] ?? null;
    pc._videoSender = cam
      ? pc.getSenders().find((s) => s.track === cam) ?? null
      : pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    pc._camSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    applyOutgoing(pc);
  }
  sendMedia(otherUserId);

  let restarted = false;
  function handleStuck() {
    if (!state || pc.connectionState === "connected" || pc.connectionState === "closed") return;
    if (!pc.currentRemoteDescription) {
      setTimeout(handleStuck, CONNECT_TIMEOUT_MS);
      return;
    }
    if (!restarted) {
      restarted = true;
      try {
        pc.restartIce();
      } catch {
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
    const track = e.track;
    if (track.kind === "video" && videoTransceivers(pc).indexOf(e.transceiver) > 0) {
      state.remoteCamStreams = { ...state.remoteCamStreams, [otherUserId]: new MediaStream([track]) };
    } else {
      const prev = state.remoteStreams[otherUserId]?.getTracks().filter((t) => t.kind !== track.kind) ?? [];
      state.remoteStreams = { ...state.remoteStreams, [otherUserId]: new MediaStream([...prev, track]) };
    }
    notify();
  };
  const looksConnected = () =>
    pc.connectionState === "connected" || pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";

  const onStateChange = () => {
    state.connectedPeers = { ...state.connectedPeers, [otherUserId]: looksConnected() };
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
  pc.oniceconnectionstatechange = onStateChange;
  state.peers.set(otherUserId, pc);
  return pc;
}

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
    const offer = tuneOpusSdp(await pc.createOffer());
    await pc.setLocalDescription(offer);
    sendSignal(userId, "offer", offer);
  } catch {
  }
}

async function handleSignal(sig) {
  if (!state || sig.callId !== state.call.id) return;
  try {
    if (sig.kind === "offer") {
      await state.mediaReadyPromise;
      if (!state || sig.callId !== state.call.id) return;
      const pc = state.peers.get(sig.fromUserId) ?? createPeer(sig.fromUserId, { answering: true });
      await pc.setRemoteDescription(new RTCSessionDescription(sig.data));
      adoptTransceivers(pc);
      const answer = tuneOpusSdp(await pc.createAnswer());
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
  }
}

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

    muted: false,
    cameraOn: call.kind === "video",
    facingBack: false,
    cameraError: null,
    cameraCount: 1,
    sharing: false,
    screenStream: null,
    screenAudio: null,
    remoteMedia: {},
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

  iceServers = await fetchIceServers();
  if (!isRoom && call.callerId === me.id) startRingback();
  if (!isRoom && call.callerId === me.id) armNoAnswerTimer();
  if (!isRoom && call.callerId !== me.id) api.answerCall(call.id).catch(() => {});

  ticker = setInterval(() => {
    if (state && state.phase === "connected") {
      state.elapsed++;
      notify();
    }
  }, 1000);

  unsubSignal = onWsMessage("call:signal", (msg) => handleSignal(msg.signal));
  unsubUpdated = onWsMessage("call:updated", (msg) => {
    if (!state || msg.call.id !== state.call.id) return;
    if (msg.call.status !== "ongoing" && state.phase !== "ended") endLocally();
  });
  unsubParticipants = onWsMessage("call:participants-updated", async (msg) => {
    if (!state || msg.call.id !== state.call.id) return;
    const { members } = await api.getChat(state.call.chatId).catch(() => ({ members: [] }));
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
      audio: CALL_AUDIO,
      video: call.kind === "video" ? cameraConstraints({ facingMode: "user" }) : false,
    });
    if (!state) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    state.localStream = stream;
    cameraCount()
      .then((n) => {
        if (state) {
          state.cameraCount = n;
          notify();
        }
      })
      .catch(() => {});
  } catch {
    if (state) state.mediaError = "Нет доступа к микрофону или камере — звук и видео от вас не передаются";
  }
  resolveMediaReady();
  notify();

  for (const p of others) {
    if (state && shouldOffer(p.id)) await offerTo(p.id);
  }
}

async function resolveParticipants(call, members) {
  const resolved = await Promise.all(
    call.participantIds.map((id) => members.find((m) => m.id === id) ?? api.getUser(id).then((r) => r.user).catch(() => undefined))
  );
  return resolved.filter((m) => m !== undefined);
}

export async function placeCall(chatId, kind, me, { ringAll = false } = {}) {
  const { call } = await api.placeCall(chatId, kind, { ringAll });
  const { chat, members } = await api.getChat(chatId);
  const participants = await resolveParticipants(call, members);
  await join({ call, chatTitle: chat.title, chatType: chat.type, participants, me });
  navigate(`/call/${call.id}`);
}

export async function joinCallById(callId, me) {
  if (state && state.call.id === callId) return;
  const { calls } = await api.listCalls();
  const call = calls.find((c) => c.id === callId);
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
    const users = await Promise.all(call.participantIds.map((id) => api.getUser(id).then((r) => r.user).catch(() => null)));
    participants = users.filter(Boolean);
  }
  await join({ call, chatTitle, chatType, participants, me });
}

export async function joinVoiceRoom(chatId, me) {
  if (state && state.call.chatId === chatId && state.isRoom) return;
  const { call } = await api.joinVoiceRoom(chatId);
  const { chat, members } = await api.getChat(chatId);
  const participants = await resolveParticipants(call, members);
  await join({ call, chatTitle: chat.title, chatType: chat.type, participants, me, isRoom: true });
  navigate(`/call/${call.id}`);
}

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

export async function toggleCamera() {
  if (!state) return;
  if (state.cameraOn) {
    state.cameraOn = false;
    const tracks = state.localStream?.getTracks() ?? [];
    tracks.filter((t) => t.kind === "video").forEach((t) => t.stop());
    if (state.localStream) state.localStream = new MediaStream(tracks.filter((t) => t.kind !== "video"));
  } else {
    let track = null;
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: cameraConstraints({ facingMode: state.facingBack ? "environment" : "user" }),
      });
      track = cam.getVideoTracks()[0] ?? null;
    } catch {
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

export async function flipCamera() {
  if (!state) return;
  if (state.switchingCamera) return;
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

  state.facingBack = !state.facingBack;
  state.cameraError = null;
  // Меняем трек внутри того же потока: <video> с этим srcObject не перезагружается
  // и не мигает чёрным, а экран звонка держит последний кадр до первого нового.
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

export async function toggleScreenShare() {
  if (!state) return;
  if (!state.sharing) {
    let display;
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
    startScreenAudio(display.getAudioTracks()[0] ?? null);
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
    if (wasOnCallScreen && chatId) navigate(`/chat/${chatId}`, { replace: true });
  }, 600);
}

const NO_ANSWER_MS = 45 * 1000;
let noAnswerTimer = null;

function armNoAnswerTimer() {
  clearTimeout(noAnswerTimer);
  noAnswerTimer = setTimeout(() => {
    if (!state || state.phase !== "ringing") return;
    hangup();
  }, NO_ANSWER_MS);
}

export async function hangup() {
  clearTimeout(noAnswerTimer);
  if (!state) return;
  const { call, others, elapsed } = state;
  const answered = state.phase === "connected";
  others.forEach((p) => sendSignal(p.id, "end", null));
  state.phase = "ended";
  stopRingtone();
  notify();
  const chatId = call.chatId;
  const leaveOnly = !state.isRoom && state.chatType === "group" && (answered || call.callerId !== state.me.id);
  if (leaveOnly) {
    await api.leaveCall(call.id).catch(() => {});
  } else if (state.isRoom) {
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
  navigate(`/chat/${chatId}`, { replace: true });
}

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
