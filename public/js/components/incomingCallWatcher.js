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

const POLL_MS = 5000;
const seen = new Set();
let primed = false;
let banner = null;
let bannerCallId = null;
let bannerTimer = null;

function showBanner(call) {
  banner?.remove();
  const other = call.otherUser ?? {};
  banner = el("div", { class: "incoming-call-screen" }, [
    el("div", { class: "incoming-call-card" }, [
      el(
        "p",
        { class: "incoming-call-kind" },
        (call.participantIds?.length ?? 0) > 2
          ? call.kind === "video"
            ? "Групповой видеозвонок"
            : "Групповой звонок"
          : call.kind === "video"
            ? "Входящий видеозвонок"
            : "Входящий звонок"
      ),
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
  bannerCallId = call.id;
  startRingtone();
  // Звонящий мог сбросить, пока связи не было, — отмена не дошла, и баннер звонил
  // бесконечно. Дольше окна звонка не звоним.
  const startedAt = new Date(call.startedAt ?? Date.now()).getTime();
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(dismiss, Math.max(5000, startedAt + RINGING_WINDOW_MS - Date.now()));
}

export async function answerCall(callId) {
  dismiss();
  await joinCallById(callId, getState().user);
  navigate(`/call/${callId}`);
}

function dismiss() {
  banner?.remove();
  banner = null;
  bannerCallId = null;
  clearTimeout(bannerTimer);
  stopRingtone();
}

const RINGING_WINDOW_MS = 60 * 1000;

async function handleNewCall(call) {
  const me = getState().user;
  if (call.callerId === me.id || call.status !== "ongoing") return;
  const startedAt = new Date(call.startedAt ?? 0).getTime();
  if (Number.isFinite(startedAt) && Date.now() - startedAt > RINGING_WINDOW_MS) return;
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
  // Только про тот звонок, что на экране: событие о другом звонке баннер не закрывает.
  onWsMessage("call:updated", (msg) => {
    if (banner && msg.call?.id === bannerCallId && msg.call.status !== "ongoing") dismiss();
  });
  onWsMessage("call:answered", (msg) => {
    if (banner && (!msg.call?.id || msg.call.id === bannerCallId)) dismiss();
  });

  async function tick(force = false) {
    if (!force && primed && isWsOpen()) return;
    // Без сети опрос просто пропускаем — раньше каждые несколько секунд летела ошибка.
    const res = await api.listCalls().catch(() => null);
    if (!res) return;
    const { calls } = res;
    if (!primed) {
      primed = true;
      for (const c of calls) if (c.status !== "ongoing") seen.add(c.id);
    }
    // Звонок на экране уже завершён (отмену по сокету пропустили) — закрываем.
    if (banner && !calls.some((c) => c.id === bannerCallId && c.status === "ongoing")) dismiss();
    for (const call of calls) {
      if (seen.has(call.id)) continue;
      seen.add(call.id);
      handleNewCall(call);
    }
  }

  tick();
  setInterval(tick, POLL_MS);
  // Пока сокет переподключался (сон телефона, смена сети), звонок мог прийти мимо —
  // после переподключения и возврата в приложение сверяемся сразу.
  onWsMessage("ws:reconnected", () => tick(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick(true);
  });
}
