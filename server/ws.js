const { WebSocketServer } = require("ws");
const { getCurrentUserIdFromCookieHeader } = require("./middleware/auth");
const { getCall } = require("./data/calls");
const { addSignal } = require("./data/signals");
const { updateUser } = require("./data/users");

// uid -> Set<WebSocket> (a user may have multiple tabs/devices open at once).
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

// Broadcasts to every connected user — used for presence, which any open
// chat/contacts view might need to reflect regardless of which chat it's for.
function broadcastToAll(message) {
  const payload = JSON.stringify(message);
  for (const set of socketsByUser.values()) {
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }
}

// Real online/last-seen presence, tracked by WS connection lifetime rather
// than a static seed flag — a user goes "online" on their first open socket
// (any tab/device) and "offline" (with a fresh lastSeen) once the last one closes.
async function markOnline(uid) {
  const user = await updateUser(uid, { online: true });
  if (user) broadcastToAll({ type: "presence:update", userId: uid, online: true, lastSeen: user.lastSeen });
}

async function markOffline(uid) {
  const lastSeen = new Date().toISOString();
  const user = await updateUser(uid, { online: false, lastSeen });
  if (user) broadcastToAll({ type: "presence:update", userId: uid, online: false, lastSeen });
}

// Live push for call signaling (offer/answer/ICE), incoming-call/decline
// notifications, and presence. HTTP polling (server/routes/calls.js signal
// endpoints) stays as a fallback for reconnect/catch-up after a page reload
// or dropped socket.
// Real messages here are small JSON signaling frames (offer/answer/ICE
// candidates, a few KB at most) — attachments never ride over this socket
// (those go through the regular HTTP API instead). 64KB is generous
// headroom over any real frame; ws's own default (no cap at all) would let
// a client send an arbitrarily large frame and force the server to buffer
// it before handleMessage() ever gets a chance to reject it.
const MAX_WS_PAYLOAD_BYTES = 64 * 1024;

function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD_BYTES });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") return; // let other upgrade handlers (if any) see it
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

  // Client sends {type: "call:signal:send", callId, toUserId, kind, data}
  // instead of the HTTP POST /api/calls/:id/signal fallback, for near-zero
  // signaling latency (offer/answer/ICE round trips are what make calls feel slow).
  if (msg.type === "call:signal:send") {
    const { callId, toUserId, kind, data } = msg;
    const call = await getCall(callId);
    if (!call || !call.participantIds.includes(ws.uid) || !call.participantIds.includes(toUserId)) return;
    const signal = await addSignal({ callId, fromUserId: ws.uid, toUserId, kind, data });
    broadcastToUsers([toUserId], { type: "call:signal", signal });
  }
}

// Сколько сейчас живых соединений и сколько за ними людей — для страницы
// состояния сервера (lib/serverStats.js). Счётчик в памяти процесса, как и всё
// остальное присутствие: при нескольких процессах он покажет только свой (см.
// AGENTS.md — приложение и не рассчитано на горизонтальное масштабирование).
function wsStats() {
  let sockets = 0;
  for (const set of socketsByUser.values()) sockets += set.size;
  return { onlineUsers: socketsByUser.size, sockets };
}

module.exports = { attachWebSocketServer, broadcastToUsers, wsStats };
