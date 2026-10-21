const handlers = new Map();
let socket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
// Выход из аккаунта на этом устройстве: сервер закроет сокет кодом 4001, но это
// ожидаемо — не переподключаемся и не показываем «сеанс завершён».
let stopped = false;
// Идёт выяснение причины 4001 — сами не переподключаемся.
let revoking = false;

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
  if (stopped) return;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
  socket = ws;
  ws.addEventListener("open", () => {
    reconnectDelay = 1000;
    // Пока сокета не было, события могли потеряться — экраны догоняют пропущенное.
    // В том числе при первом открытии: экран успевает загрузить данные по HTTP раньше,
    // чем открывается сокет, и событие между этими моментами иначе пропало бы.
    emit({ type: "ws:reconnected" });
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
  ws.addEventListener("close", (ev) => {
    if (socket !== ws) return;
    clearTimeout(pingTimer);
    clearTimeout(pongTimer);
    // 4001 — сервер завершил сессию этого устройства (выход в другой вкладке,
    // «Завершить сеанс» с другого устройства, смена пароля, бан). Переподключаться
    // бессмысленно: сразу выясняем причину по HTTP, как при ответе session_revoked.
    if (ev.code === 4001) {
      handleRevoked();
      return;
    }
    scheduleReconnect();
  });
  ws.addEventListener("error", () => ws.close());
}

// Тот же выход, что в api.js при ошибке session_revoked / banned: спрашиваем
// защищённый маршрут — он скажет, отозван сеанс или аккаунт заблокирован.
async function handleRevoked() {
  revoking = true;
  let res;
  try {
    res = await fetch("/api/sessions", { credentials: "same-origin", cache: "no-store" });
  } catch {
    // Нет сети — пробуем позже обычным порядком.
    revoking = false;
    scheduleReconnect();
    return;
  }
  if (stopped) return;
  if (res.ok) {
    // Сеанс жив (например, закрыли сокет другого аккаунта этого устройства) — переподключаемся.
    revoking = false;
    scheduleReconnect();
    return;
  }
  const body = await res.json().catch(() => ({}));
  if (stopped) return;
  if (body.error === "banned") {
    // Сокет не переподключаем (revoking остаётся true): до снятия блокировки — только экран бана.
    import("../components/banScreen.js").then((m) => m.showBanScreen(body));
  } else if (body.error === "session_revoked") {
    window.location.href = "/login?reason=revoked";
  } else {
    window.location.href = "/login";
  }
}

function scheduleReconnect() {
  if (stopped) return;
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
  if (!socket || revoking) return;
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

// Перед выходом из активного аккаунта: сокет закрываем сами, 4001 от сервера
// больше не приведёт на экран «сеанс завершён».
export function stopWsClient() {
  stopped = true;
  clearTimeout(reconnectTimer);
  clearTimeout(pingTimer);
  clearTimeout(pongTimer);
  const ws = socket;
  socket = null;
  try {
    ws?.close();
  } catch {}
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
