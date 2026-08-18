import { el } from "../lib/dom.js";
import { Avatar } from "./avatar.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { onWsMessage, isWsOpen } from "../lib/wsClient.js";
import { requestPushPermission } from "../lib/push.js";
import { joinCallById, decline } from "../lib/callController.js";
import { startRingtone, stopRingtone } from "../lib/ringtone.js";
import { navigate } from "../router.js";

// The socket delivers "call:incoming" (see the handler below), so this poll is
// only a catch-up for a dropped connection. At 2.5s it was 120 requests per tab
// per 5 minutes — the single largest consumer of the rate-limit budget, for
// something already being pushed.
const POLL_MS = 20000;
const seen = new Set();
let primed = false;
let banner = null;

// Входящий звонок занимает весь экран, а не строчку сверху.
//
// Так это выглядит на любом телефоне, и по делу: звонок — единственное в
// приложении, на что отвечают немедленно, и промахнуться мимо маленькой
// кнопки в углу, пока телефон в руке, слишком легко. Здесь крупный аватар,
// имя, вид звонка и две большие кнопки, до которых дотягивается большой палец.
function showBanner(call) {
  banner?.remove();
  const other = call.otherUser ?? {};
  banner = el("div", { class: "incoming-call-screen" }, [
    el("div", { class: "incoming-call-card" }, [
      el("p", { class: "incoming-call-kind" }, call.kind === "video" ? "Входящий видеозвонок" : "Входящий звонок"),
      el("div", { class: "incoming-call-avatar" }, [
        Avatar({ name: other.name ?? "?", color: other.avatarColor, image: other.avatarImage, size: 132 }),
      ]),
      el("p", { class: "incoming-call-name" }, other.name ?? "Звонок"),
      el("p", { class: "incoming-call-hint" }, other.username ? `@${other.username}` : "Звонит…"),
      el("div", { class: "incoming-call-actions" }, [
        el("div", { class: "incoming-call-action" }, [
          el("button", {
            class: "incoming-call-btn decline",
            title: "Отклонить",
            html: iconSvg("Phone", 26, "rotate-135"),
            onclick: async () => {
              await decline(call);
              dismiss();
            },
          }),
          el("span", { class: "incoming-call-action-label" }, "Отклонить"),
        ]),
        el("div", { class: "incoming-call-action" }, [
          el("button", {
            class: "incoming-call-btn accept",
            title: "Ответить",
            html: iconSvg(call.kind === "video" ? "Video" : "Phone", 26),
            onclick: () => answerCall(call.id),
          }),
          el("span", { class: "incoming-call-action-label" }, "Ответить"),
        ]),
      ]),
    ]),
  ]);
  document.body.appendChild(banner);
  startRingtone();
}

// Приём звонка — одним путём и для кнопки на экране, и для перехода из
// уведомления (?answer=1, см. public/sw.js): иначе «ответить» из уведомления
// открывало бы экран с ещё одной кнопкой «ответить».
export async function answerCall(callId) {
  dismiss();
  await joinCallById(callId, getState().user);
  navigate(`/call/${callId}`);
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
