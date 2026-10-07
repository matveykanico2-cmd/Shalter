import { isWsStarted, isWsOpen } from "./wsClient.js";

// Статус сети: устройство без сети, сокет какое-то время не на связи или запрос
// к API висит дольше пары секунд.
const SLOW_MS = 2000;
const WS_GRACE_MS = 2000;

let pending = new Map();
let seq = 0;
let wsDownSince = 0;
let pill = null;
let label = null;

export function trackRequest(promise) {
  const id = ++seq;
  pending.set(id, Date.now());
  const done = () => pending.delete(id);
  promise.then(done, done);
  return promise;
}

// Как в Telegram: статус сети — в заголовке над списком чатов («Shalter» →
// «Ожидание сети…» со спиннером), без цветных полос.
// Если поиска на экране нет (телефон, открыт чат), показываем маленькую «таблетку».
// Короткие сбои (< WS_GRACE_MS) не показываем вовсе, чтобы статус не мигал.
let hadConnect = false;

function currentText() {
  if (!navigator.onLine) return "Ожидание сети…";
  const now = Date.now();
  if (isWsStarted() && !isWsOpen()) {
    if (!wsDownSince) wsDownSince = now;
    if (now - wsDownSince > WS_GRACE_MS) return hadConnect ? "Переподключение…" : "Соединение…";
  } else {
    if (isWsOpen()) hadConnect = true;
    wsDownSince = 0;
  }
  for (const started of pending.values()) if (now - started > SLOW_MS) return "Обновление…";
  return null;
}

// Статус — в заголовок над списком чатов («Shalter» ↔ «Ожидание сети…»).
function applyToTitle(text) {
  const bar = document.querySelector(".chat-list-title-bar");
  if (!bar || !bar.offsetParent) return false;
  const label = bar.querySelector(".chat-list-title-text");
  const next = text ?? "Shalter";
  if (label && label.textContent !== next) label.textContent = next;
  bar.classList.toggle("connecting", !!text);
  return true;
}

function tick() {
  const text = currentText();
  const inSearch = applyToTitle(text);
  if (!pill) {
    if (!text || inSearch || !document.body) return;
    label = document.createElement("span");
    pill = document.createElement("div");
    pill.className = "net-status-pill";
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");
    const spin = document.createElement("span");
    spin.className = "net-status-spinner";
    pill.append(spin, label);
    document.body.appendChild(pill);
  }
  if (text) label.textContent = text;
  pill.classList.toggle("visible", !!text && !inSearch);
}

export function initNetStatus() {
  setInterval(tick, 500);
  window.addEventListener("online", tick);
  window.addEventListener("offline", tick);
}
