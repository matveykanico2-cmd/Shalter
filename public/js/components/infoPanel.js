import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openReportDialog } from "./reportDialog.js";
import { openProfileDialog } from "./profileDialog.js";

// Vanilla-JS port of components/chat/InfoPanel.tsx: chat/members, mute
// toggle, block management, and — for group/channel owners/admins — member
// role management (promote/demote/kick).
export function InfoPanel({ chat, members, isBlocked, meId, isShalterAdmin, gifts, onClose, onToggleMute, onToggleBlock, onMemberAction, onTogglePremium, onDeliverGift }) {
  const isDm = chat.type === "dm" || chat.type === "secret";
  const title = isDm ? (chat.otherUser?.name ?? chat.title) : chat.title;
  const isOwnerOrAdmin = chat.ownerId === meId || chat.adminIds?.includes(meId);

  function openMemberMenu(e, member) {
    const isAdmin = chat.adminIds?.includes(member.id);
    openDropdownMenu({ x: e.clientX, y: e.clientY }, [
      {
        icon: "Users",
        label: isAdmin ? "Снять права администратора" : "Сделать администратором",
        onClick: () => onMemberAction(member.id, isAdmin ? "demote" : "promote"),
      },
      { icon: "X", label: "Исключить из чата", danger: true, onClick: () => onMemberAction(member.id, "kick") },
    ]);
  }

  return el("aside", { class: "info-panel" }, [
    el("div", { class: "info-panel-header" }, [
      el("h2", {}, "Информация"),
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: onClose }),
    ]),
    el("div", { class: "info-panel-body" }, [
      el(
        isDm && chat.otherUser ? "button" : "div",
        {
          class: `info-panel-avatar-row ${isDm && chat.otherUser ? "clickable" : ""}`,
          onclick: isDm && chat.otherUser ? () => openProfileDialog(chat.otherUser.id) : null,
        },
        [
          Avatar({
            name: chat.otherUser?.name ?? title,
            color: chat.avatarColor,
            image: chat.otherUser?.avatarImage ?? chat.avatarImage,
            size: 72,
            isPremium: isDm && chat.otherUser?.isPremium,
            isDeveloper: isDm && chat.otherUser?.isDeveloper,
            orbit: true,
          }),
          el("p", { class: "info-panel-title" }, [
            title,
            isDm && chat.otherUser?.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 16) }) : null,
            isDm && chat.otherUser?.isPremium ? el("span", { class: "premium-mini-badge", html: iconSvg("Crown", 16) }) : null,
          ]),
        ]
      ),
      isDm && chat.otherUser && isShalterAdmin
        ? el(
            "button",
            { class: "info-panel-row", onclick: () => onTogglePremium(chat.otherUser.id, !chat.otherUser.isPremium) },
            chat.otherUser.isPremium ? "Забрать Shalter Premium" : "Выдать Shalter Premium (30 дней)"
          )
        : null,
      isDm && chat.otherUser && isShalterAdmin && gifts?.length
        ? el(
            "button",
            {
              class: "info-panel-row",
              onclick: (e) =>
                openDropdownMenu(
                  { x: e.clientX, y: e.clientY },
                  gifts.map((g) => ({
                    label: `${g.emoji} ${g.name} — ${g.priceRub}₽`,
                    onClick: () => onDeliverGift(g.id, chat.otherUser.id),
                  }))
                ),
            },
            "🎁 Отправить подарок"
          )
        : null,
      el("button", { class: "info-panel-row", onclick: onToggleMute }, chat.muted ? "Включить уведомления" : "Отключить уведомления"),
      isDm ? el("button", { class: "info-panel-row danger", onclick: onToggleBlock }, isBlocked ? "Разблокировать" : "Заблокировать") : null,
      isDm && chat.otherUser
        ? el(
            "button",
            { class: "info-panel-row danger", onclick: () => openReportDialog("user", chat.otherUser.id, chat.otherUser.name) },
            "Пожаловаться"
          )
        : null,
      !isDm
        ? el(
            "button",
            { class: "info-panel-row danger", onclick: () => openReportDialog("chat", chat.id, title) },
            `Пожаловаться на ${chat.type === "channel" ? "канал" : "группу"}`
          )
        : null,
      !isDm
        ? el("div", { class: "info-panel-members" }, [
            el("p", { class: "list-section-label" }, `Участники (${members.length})`),
            ...members.map((m) => {
              const isMemberOwner = m.id === chat.ownerId;
              const isMemberAdmin = chat.adminIds?.includes(m.id);
              const canManage = isOwnerOrAdmin && !isMemberOwner && m.id !== meId;
              return el("div", { class: "info-panel-member-row" }, [
                el("button", { class: "info-panel-member-profile-btn", onclick: () => openProfileDialog(m.id) }, [
                  Avatar({ name: m.name, color: m.avatarColor, image: m.avatarImage, size: 32 }),
                  el("span", { class: "info-panel-member-name" }, [
                    m.name,
                    isMemberOwner ? el("span", { class: "info-panel-role-tag" }, " владелец") : isMemberAdmin ? el("span", { class: "info-panel-role-tag" }, " админ") : null,
                  ]),
                ]),
                canManage
                  ? el("button", { class: "icon-btn", html: iconSvg("More", 15), onclick: (e) => openMemberMenu(e, m) })
                  : null,
              ]);
            }),
          ])
        : null,
    ]),
  ]);
}
