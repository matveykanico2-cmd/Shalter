const { WebSocketServer } = require("ws");
const { getCurrentUserIdFromCookieHeader } = require("./middleware/auth");
const { getCall } = require("./data/calls");
const liveStreams = require("./data/liveStreams");
const { addSignal } = require("./data/signals");
const { updateUser } = require("./data/users");

const socketsByUser = new Map();

function addSocket(uid, ws) {
  if (!socketsByUser.has(uid)) socketsByUser.set(uid, new Set());
  socketsByUser.get(uid).add(ws);
}

function removeSocket(uid, ws) {
  const set = socketsByUser.get(uid);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) socketsByUser.delete(uid);
}

function broadcastToUsers(userIds, message) {
  const payload = JSON.stringify(message);
  for (const uid of userIds) {
    const set = socketsByUser.get(uid);
    if (!set) continue;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }
}

function broadcastToAll(message) {
  const payload = JSON.stringify(message);
  for (const set of socketsByUser.values()) {
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }
}

async function markOnline(uid) {
  const user = await updateUser(uid, { online: true });
  if (user) broadcastToAll({ type: "presence:update", userId: uid, online: true, lastSeen: user.lastSeen });
}

async function markOffline(uid) {
  const lastSeen = new Date().toISOString();
  const user = await updateUser(uid, { online: false, lastSeen });
  if (user) broadcastToAll({ type: "presence:update", userId: uid, online: false, lastSeen });
}

const MAX_WS_PAYLOAD_BYTES = 64 * 1024;

function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD_BYTES });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") return;
    const uid = getCurrentUserIdFromCookieHeader(req.headers.cookie);
    if (!uid) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.uid = uid;
      const wasOffline = !socketsByUser.has(uid);
      addSocket(uid, ws);
      if (wasOffline) markOnline(uid);
      ws.on("message", (raw) => handleMessage(ws, raw));
      ws.on("close", () => {
        removeSocket(uid, ws);
        if (!socketsByUser.has(uid)) markOffline(uid);
      });
    });
  });

  return wss;
}

async function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (msg.type === "live:signal:send") {
    const { streamId, toUserId, kind, data } = msg;
    const stream = liveStreams.getStream(streamId);
    if (!stream || stream.status !== "live") return;
    if (!liveStreams.getParticipant(streamId, ws.uid) || !liveStreams.getParticipant(streamId, toUserId)) return;
    broadcastToUsers([toUserId], { type: "live:signal", streamId, fromUserId: ws.uid, kind, data });
    return;
  }

  if (msg.type === "call:signal:send") {
    const { callId, toUserId, kind, data } = msg;
    const call = await getCall(callId);
    if (!call || !call.participantIds.includes(ws.uid) || !call.participantIds.includes(toUserId)) return;
    const signal = await addSignal({ callId, fromUserId: ws.uid, toUserId, kind, data });
    broadcastToUsers([toUserId], { type: "call:signal", signal });
  }
}

function wsStats() {
  let sockets = 0;
  for (const set of socketsByUser.values()) sockets += set.size;
  return { onlineUsers: socketsByUser.size, sockets };
}

module.exports = { attachWebSocketServer, broadcastToUsers, wsStats };
