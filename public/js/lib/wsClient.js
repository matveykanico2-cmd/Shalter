const handlers = new Map();
let socket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let everOpened = false;

// Проверка живости. После сна телефона или смены сети сокет часто остаётся «зомби»:
// readyState OPEN, а данные не идут, и close не приходит минутами. Всё это время
// сообщения не приходили, а опрос-подстраховка считал сокет живым и ждал минуту.
// Шлём ping; нет ответа (pong или любого события) за PONG_TIMEOUT_MS — переподключаемся.
const PING_EVERY_MS = 20_000;
const PONG_TIMEOUT_MS = 6_000;
let pingTimer = null;
let pongTimer = null;

function emit(msg) {
  const set = handlers.get(msg.type);
  if (set) set.forEach((fn) => fn(msg));
}

function connect() {
  clearTimeout(reconnectTimer);
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
  socket = ws;
  ws.addEventListener("open", () => {
    reconnectDelay = 1000;
    // Пока сокета не было, события могли потеряться — экраны догоняют пропущенное.
    if (everOpened) emit({ type: "ws:reconnected" });
    everOpened = true;
    schedulePing();
  });
  ws.addEventListener("message", (ev) => {
    clearTimeout(pongTimer);
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "pong") return;
    emit(msg);
  });
  ws.addEventListener("close", () => {
    if (socket !== ws) return;
    clearTimeout(pingTimer);
    clearTimeout(pongTimer);
    scheduleReconnect();
  });
  ws.addEventListener("error", () => ws.close());
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
}

// Сокет мёртв — бросаем его и сразу открываем новый.
function reconnectNow() {
  const dead = socket;
  socket = null;
  clearTimeout(pingTimer);
  clearTimeout(pongTimer);
  try {
    dead?.close();
  } catch {}
  reconnectDelay = 1000;
  connect();
}

function ping() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  clearTimeout(pongTimer);
  pongTimer = setTimeout(reconnectNow, PONG_TIMEOUT_MS);
  try {
    socket.send('{"type":"ping"}');
  } catch {
    reconnectNow();
  }
}

function schedulePing() {
  clearTimeout(pingTimer);
  pingTimer = setTimeout(() => {
    ping();
    schedulePing();
  }, PING_EVERY_MS);
}

// Вернулись в приложение или появилась сеть — проверяем сокет сразу, а не ждём
// следующего ping; закрытый — открываем без ожидания нарастающей паузы.
function checkNow() {
  if (!socket) return;
  if (socket.readyState === WebSocket.OPEN) ping();
  else if (socket.readyState !== WebSocket.CONNECTING) reconnectNow();
}

export function startWsClient() {
  if (socket) return;
  connect();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkNow();
  });
  window.addEventListener("online", checkNow);
  window.addEventListener("pageshow", checkNow);
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
