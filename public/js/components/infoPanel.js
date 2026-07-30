import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";

// Reduced vanilla-JS version of components/chat/InfoPanel.tsx: shows the
// chat/members and the mute toggle. Member roles, secret-chat timer and
// block-management get full parity in a later polish pass.
export function InfoPanel({ chat, members, isBlocked, onClose, onToggleMute, onToggleBlock }) {
  const isDm = chat.type === "dm" || chat.type === "secret";
  const title = isDm ? (chat.otherUser?.name ?? chat.title) : chat.title;

  return el("aside", { class: "info-panel" }, [
    el("div", { class: "info-panel-header" }, [
      el("h2", {}, "Информация"),
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: onClose }),
    ]),
    el("div", { class: "info-panel-body" }, [
      el("div", { class: "info-panel-avatar-row" }, [
        Avatar({ name: chat.otherUser?.name ?? title, color: chat.avatarColor, image: chat.otherUser?.avatarImage, size: 72 }),
        el("p", { class: "info-panel-title" }, title),
      ]),
      el("button", { class: "info-panel-row", onclick: onToggleMute }, chat.muted ? "Включить уведомления" : "Отключить уведомления"),
      isDm ? el("button", { class: "info-panel-row danger", onclick: onToggleBlock }, isBlocked ? "Разблокировать" : "Заблокировать") : null,
      !isDm
        ? el("div", { class: "info-panel-members" }, [
            el("p", { class: "list-section-label" }, `Участники (${members.length})`),
            ...members.map((m) =>
              el("div", { class: "info-panel-member-row" }, [
                Avatar({ name: m.name, color: m.avatarColor, image: m.avatarImage, size: 32 }),
                el("span", {}, m.name),
              ])
            ),
          ])
        : null,
    ]),
  ]);
}
