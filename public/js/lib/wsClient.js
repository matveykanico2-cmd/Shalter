const handlers = new Map();
let socket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let everOpened = false;

function emit(msg) {
  const set = handlers.get(msg.type);
  if (set) set.forEach((fn) => fn(msg));
}

function connect() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${proto}//${window.location.host}/ws`);
  socket.addEventListener("open", () => {
    reconnectDelay = 1000;
    // Пока сокета не было, события могли потеряться — экраны догоняют пропущенное.
    if (everOpened) emit({ type: "ws:reconnected" });
    everOpened = true;
  });
  socket.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    emit(msg);
  });
  socket.addEventListener("close", scheduleReconnect);
  socket.addEventListener("error", () => socket.close());
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
}

export function startWsClient() {
  if (!socket) connect();
}

export function isWsStarted() {
  return !!socket;
}

export function isWsOpen() {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

export function wsSend(obj) {
  if (isWsOpen()) socket.send(JSON.stringify(obj));
}

export function onWsMessage(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type)?.delete(fn);
}
