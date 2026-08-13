import { el, mount } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { navigate } from "../router.js";
import { placeCall } from "../lib/callController.js";

function timeLabel(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function durationLabel(sec) {
  if (sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function CallsView(root) {
  const { calls } = await api.listCalls();
  const me = getState().user;

  const list = el(
    "div",
    { class: "chat-list-scroll" },
    calls.length === 0
      ? el("p", { class: "empty-hint" }, "Звонков ещё не было")
      : calls.map((c) =>
          el("div", { class: "contact-row" }, [
            Avatar({ name: c.otherUser?.name ?? "?", color: c.otherUser?.avatarColor ?? "#8A8F98", image: c.otherUser?.avatarImage }),
            el("div", { class: "contact-row-body" }, [
              el("p", { class: `contact-row-name ${c.status === "missed" ? "missed-call" : ""}` }, c.otherUser?.name ?? "Неизвестно"),
              el("p", { class: "contact-row-status" }, [
                el("span", { html: iconSvg(c.kind === "video" ? "Video" : "Phone", 12) }),
                ` ${c.direction === "incoming" ? "Входящий" : "Исходящий"}`,
                c.status === "missed" ? " · пропущен" : c.durationSec ? ` · ${durationLabel(c.durationSec)}` : "",
                ` · ${timeLabel(c.startedAt)}`,
              ]),
            ]),
            el("button", {
              class: "icon-btn",
              title: "Позвонить",
              html: iconSvg("Phone", 16),
              onclick: () => placeCall(c.chatId, "audio", me),
            }),
            el("button", {
              class: "icon-btn",
              title: "Видеозвонок",
              html: iconSvg("Video", 16),
              onclick: () => placeCall(c.chatId, "video", me),
            }),
          ])
        )
  );

  mount(
    root,
    el("div", { class: "contacts-view" }, [
      el("header", { class: "contacts-header" }, [
        el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
        el("p", { class: "view-title" }, "Звонки"),
      ]),
      list,
    ])
  );
}
