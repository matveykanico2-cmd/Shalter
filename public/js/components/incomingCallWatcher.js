import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { onWsMessage, isWsOpen } from "../lib/wsClient.js";
import { requestPushPermission } from "../lib/push.js";
import { joinCallById, decline } from "../lib/callController.js";
import { startRingtone, stopRingtone } from "../lib/ringtone.js";
import { navigate } from "../router.js";

const POLL_MS = 2500;
const seen = new Set();
let primed = false;
let banner = null;

function showBanner(call) {
  banner?.remove();
  banner = el("div", { class: "incoming-call-banner" }, [
    el("div", { class: "incoming-call-info" }, [
      el("p", { class: "incoming-call-title" }, call.otherUser?.name ?? "Звонок"),
      el("p", { class: "incoming-call-subtitle" }, call.kind === "video" ? "Видеозвонок…" : "Звонит…"),
    ]),
    el("button", {
      class: "incoming-call-btn decline",
      html: iconSvg("Phone", 18, "rotate-135"),
      onclick: async () => {
        await decline(call);
        dismiss();
      },
    }),
    el("button", {
      class: "incoming-call-btn accept",
      html: iconSvg("Phone", 18),
      onclick: async () => {
        dismiss();
        await joinCallById(call.id, getState().user);
        navigate(`/call/${call.id}`);
      },
    }),
  ]);
  document.body.appendChild(banner);
  startRingtone();
}

function dismiss() {
  banner?.remove();
  banner = null;
  stopRingtone();
}

async function handleNewCall(call) {
  const me = getState().user;
  if (call.callerId === me.id || call.status !== "ongoing") return;
  // No foreground Notification here — the in-app banner below already
  // covers "app open and visible". A real Web Push (server/routes/calls.js)
  // covers the other cases (backgrounded tab, browser closed) via
  // public/sw.js, which itself skips showing anything if a focused tab is
  // already open, so this and push never double up.
  showBanner(call);
}

export function mountIncomingCallWatcher() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    requestPushPermission().catch(() => {});
  }

  onWsMessage("call:incoming", (msg) => {
    if (seen.has(msg.call.id)) return;
    seen.add(msg.call.id);
    handleNewCall(msg.call);
  });
  onWsMessage("call:updated", (msg) => {
    if (banner && msg.call.status !== "ongoing") dismiss();
  });

  async function tick() {
    if (isWsOpen()) return; // WS push covers it; poll is only the fallback
    const { calls } = await api.listCalls();
    if (!primed) {
      primed = true;
      calls.forEach((c) => seen.add(c.id));
      return;
    }
    for (const call of calls) {
      if (seen.has(call.id)) continue;
      seen.add(call.id);
      handleNewCall(call);
    }
  }

  tick();
  setInterval(tick, POLL_MS);
}
