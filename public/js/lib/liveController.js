import { api } from "../api.js";
import { wsSend, onWsMessage, isWsOpen } from "./wsClient.js";
import { getState } from "../state.js";
import { HD_SCREEN, cameraConstraints, tunePeerVideo, hintScreenTrack } from "./mediaQuality.js";
import { fetchIceServers } from "./iceServers.js";

let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

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

const isRtmp = () => state?.stream?.source === "rtmp";
const publishes = (role) => !isRtmp() && (role === "host" || role === "speaker");

function sendSignal(toUserId, kind, data) {
  if (isWsOpen()) wsSend({ type: "live:signal:send", streamId: state.stream.id, toUserId, kind, data });
}

function shouldOffer(otherRole, otherId) {
  if (!publishes(state.myRole)) return false;
  if (!publishes(otherRole)) return true;
  return state.me.id < otherId;
}

function createPeer(otherUserId) {
  const pc = new RTCPeerConnection({ iceServers });
  const sending = new Set();
  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => {
      pc.addTrack(t, state.localStream);
      sending.add(t.kind);
    });
    tunePeerVideo(pc, { screen: state.sharing });
  }
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
  }
}

function dropPeer(userId) {
  const pc = state.peers.get(userId);
  if (pc) {
    try {
      pc.close();
    } catch {
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
        if (existing.signalingState !== "stable" && state.me.id < from) return;
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
  }
}

async function acquireMedia() {
  if (isRtmp()) return null;
  const wantVideo = publishes(state.myRole) && state.stream.withVideo;
  const wantAudio = publishes(state.myRole);
  if (!wantAudio && !wantVideo) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: wantAudio,
      video: wantVideo ? cameraConstraints() : false,
    });
  } catch (err) {
    state.error = wantVideo ? "Нет доступа к камере или микрофону" : "Нет доступа к микрофону";
    return null;
  }
}

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

async function refreshPublishing() {
  stopLocalMedia();
  for (const id of [...state.peers.keys()]) dropPeer(id);
  state.camStream = await acquireMedia();
  await republish();
}

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
  state.localStream?.getVideoTracks().forEach((t) => {
    t.enabled = t === state.screenTrack ? true : state.camOn;
  });
}

async function connectAll() {
  for (const p of state.participants) {
    if (p.userId === state.me.id) continue;
    const existing = state.peers.get(p.userId);
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

  const present = new Set(data.participants.map((p) => p.userId));
  for (const id of [...state.peers.keys()]) if (!present.has(id)) dropPeer(id);

  if (state.myRole !== prevRole) {
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
  if (data.ingest) state.ingest = data.ingest;
  state.participants = data.participants;
  state.messages = data.messages;
  state.myRole = data.participants.find((p) => p.userId === me.id)?.role ?? "viewer";
  iceServers = await fetchIceServers();
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
    onWsMessage("live:message-updated", (msg) => {
      if (!state || msg.streamId !== state.stream.id) return;
      state.messages = state.messages.map((m) => (m.id === msg.message.id ? msg.message : m));
      notify();
    })
  );
  state.unsubs.push(
    onWsMessage("live:message-deleted", (msg) => {
      if (!state || msg.streamId !== state.stream.id) return;
      state.messages = state.messages.filter((m) => m.id !== msg.messageId);
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

export async function toggleScreenShare() {
  if (!state || !publishes(state.myRole)) return;

  if (state.sharing) {
    stopScreen();
    await republish();
    return;
  }

  let display = null;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({ ...HD_SCREEN, audio: false, systemAudio: "exclude" });
  } catch {
    return;
  }
  const track = display.getVideoTracks()[0];
  if (!track) return;

  hintScreenTrack(track);
  state.screenTrack = track;
  state.sharing = true;
  track.onended = () => {
    if (!state || !state.sharing) return;
    stopScreen();
    republish();
  };
  await republish();
}
