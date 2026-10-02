import { isWsStarted, isWsOpen } from "./wsClient.js";

// A small "Соединение…" pill with a spinner, shown while the network is bad:
// the device is offline, the live socket has been down for a moment, or an API
// request has been hanging for a couple of seconds.
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

function currentText() {
  if (!navigator.onLine) return "Ожидание сети…";
  const now = Date.now();
  if (isWsStarted() && !isWsOpen()) {
    if (!wsDownSince) wsDownSince = now;
    if (now - wsDownSince > WS_GRACE_MS) return "Соединение…";
  } else {
    wsDownSince = 0;
  }
  for (const started of pending.values()) if (now - started > SLOW_MS) return "Загрузка…";
  return null;
}

function tick() {
  const text = currentText();
  if (!pill) {
    if (!text || !document.body) return;
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
  pill.classList.toggle("visible", !!text);
}

export function initNetStatus() {
  setInterval(tick, 500);
  window.addEventListener("online", tick);
  window.addEventListener("offline", tick);
}
