import { api } from "../api.js";

const CHECK_EVERY_MS = 5 * 60 * 1000;
const IDLE_BEFORE_RELOAD_MS = 30 * 1000;

let known = null;
let pending = false;
let lastActivity = Date.now();

function markActivity() {
  lastActivity = Date.now();
}

function isBusy() {
  if (document.querySelector(".call-screen, .incoming-call-screen, .live-overlay, .call-pip")) return true;
  for (const field of document.querySelectorAll("input, textarea, [contenteditable='true']")) {
    const value = field.value ?? field.textContent ?? "";
    if (value.trim() && field.type !== "search") return true;
  }
  if (document.querySelector(".modal-overlay")) return true;
  if (Date.now() - lastActivity < IDLE_BEFORE_RELOAD_MS) return true;
  return false;
}

function reloadNow() {
  window.location.replace(window.location.href);
}

async function check() {
  try {
    const { version } = await api.getAppVersion();
    if (!version || version === "dev") return;
    if (known === null) {
      known = version;
      return;
    }
    if (version !== known) pending = true;
  } catch {
  }
  if (pending && !isBusy()) reloadNow();
}

export function startVersionWatch() {
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(ev, markActivity, { passive: true });
  }
  check();
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
