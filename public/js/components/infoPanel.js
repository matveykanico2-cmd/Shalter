import { el } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openReportDialog } from "./reportDialog.js";
import { openProfileDialog } from "./profileDialog.js";
import { openChoiceDialog } from "./confirmDialog.js";
import { openChannelPublicDialog } from "./channelPublicDialog.js";
import { levelForPoints, pointsToNextLevel } from "../lib/groupLevels.js";

const RESTRICT_DURATIONS = [
  { label: "На 1 час", hours: 1 },
  { label: "На 1 день", hours: 24 },
  { label: "На 1 неделю", hours: 24 * 7 },
  { label: "Навсегда", hours: null },
];

// Chat-level "auto-delete messages" timer (chat.autoDeleteSeconds, swept
// server-side by server/lib/autoDelete.js) — same duration scale Telegram's
// own picker offers.
const AUTO_DELETE_DURATIONS = [
  { label: "Выключено", seconds: null },
  { label: "1 день", seconds: 24 * 3600 },
  { label: "1 неделя", seconds: 7 * 24 * 3600 },
  { label: "1 месяц", seconds: 30 * 24 * 3600 },
];

function autoDeleteLabel(seconds) {
  return AUTO_DELETE_DURATIONS.find((d) => d.seconds === seconds)?.label ?? "Выключено";
}

// Vanilla-JS port of components/chat/InfoPanel.tsx: chat/members, mute
// toggle, block management, and — for group/channel owners/admins — member
// role management (promote/demote/kick/restrict).
export function InfoPanel({ chat, members, isBlocked, meId, isMePremium, isShalterAdmin, gifts, onClose, onToggleMute, onToggleBlock, onMemberAction, onTogglePremium, onDeliverGift, onAddMember, onRestrictMember, onVoteForGroup, onSetAutoDelete, onChatUpdated }) {
  const isDm = chat.type === "dm" || chat.type === "secret";
  const title = isDm ? (chat.otherUser?.name ?? chat.title) : chat.title;
  const isOwnerOrAdmin = chat.ownerId === meId || chat.adminIds?.includes(meId);
  // Either DM party can set the timer (it's a mutual chat property, same as
  // Telegram); for groups/channels it's owner/admin-only, same bar as the
  // other chat-wide settings (restrict/points aren't member-settable either).
  const canSetAutoDelete = isDm || isOwnerOrAdmin;

  function openMemberMenu(e, member) {
    const isAdmin = chat.adminIds?.includes(member.id);
    const isRestricted = !!chat.restrictions?.[member.id];
    const items = [
      {
        icon: "Users",
        label: isAdmin ? "Снять права администратора" : "Сделать администратором",
        onClick: () => onMemberAction(member.id, isAdmin ? "demote" : "promote"),
      },
    ];
    if (isRestricted) {
      items.push({ icon: "Check", label: "Разрешить писать", onClick: () => onRestrictMember(member.id, null) });
    } else {
      items.push({
        icon: "Lock",
        label: "Запретить писать",
        onClick: (evt) =>
          openChoiceDialog(
            `Запретить писать: ${member.name}`,
            RESTRICT_DURATIONS.map((d) => ({
              label: d.label,
              onClick: () => onRestrictMember(member.id, d.hours == null ? "forever" : new Date(Date.now() + d.hours * 3600_000).toISOString()),
            }))
          ),
      });
    }
    items.push({ icon: "X", label: "Исключить из чата", danger: true, onClick: () => onMemberAction(member.id, "kick") });
    openDropdownMenu({ x: e.clientX, y: e.clientY }, items);
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
            chat.type === "group" && levelForPoints(chat.points) > 0
              ? el("span", { class: "group-level-badge", title: `${chat.points} баллов` }, `★ Ур. ${levelForPoints(chat.points)}`)
              : null,
          ]),
        ]
      ),
      chat.type === "group"
        ? el("div", { class: "group-vote-row" }, [
            el("div", {}, [
              el("p", { class: "settings-toggle-title" }, `Баллы группы: ${chat.points ?? 0} (уровень ${levelForPoints(chat.points)})`),
              el(
                "p",
                { class: "settings-toggle-hint" },
                pointsToNextLevel(chat.points) != null ? `До следующего уровня: ${pointsToNextLevel(chat.points)}` : "Максимальный уровень"
              ),
            ]),
            isMePremium
              ? el("button", { class: "settings-add-account-btn", onclick: onVoteForGroup }, "Голосовать")
              : el("span", { class: "settings-toggle-hint" }, "Только с Premium"),
          ])
        : null,
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
      canSetAutoDelete
        ? el(
            "button",
            {
              class: "info-panel-row",
              onclick: (e) =>
                openDropdownMenu(
                  { x: e.clientX, y: e.clientY },
                  AUTO_DELETE_DURATIONS.map((d) => ({
                    label: d.label,
                    onClick: () => onSetAutoDelete(d.seconds),
                  }))
                ),
            },
            `Автоудаление сообщений: ${autoDeleteLabel(chat.autoDeleteSeconds)}`
          )
        : null,
      chat.type === "channel" && isOwnerOrAdmin
        ? el(
            "button",
            { class: "info-panel-row", onclick: () => openChannelPublicDialog(chat, onChatUpdated) },
            chat.isPublic ? `Публичный канал: @${chat.username}` : "Сделать канал публичным"
          )
        : null,
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
      // Channel subscriber lists are admin/owner-only (matches Telegram —
      // a channel is broadcast, not a peer group, so regular subscribers
      // don't get to see who else is subscribed); group member lists stay
      // visible to every member, same as before.
      !isDm && (chat.type !== "channel" || isOwnerOrAdmin)
        ? el("div", { class: "info-panel-members" }, [
            el("div", { class: "info-panel-members-header" }, [
              el("p", { class: "list-section-label" }, `Участники (${members.length})`),
              isOwnerOrAdmin
                ? el("button", { class: "icon-btn", title: "Добавить участника", html: iconSvg("Plus", 15), onclick: onAddMember })
                : null,
            ]),
            ...members.map((m) => {
              const isMemberOwner = m.id === chat.ownerId;
              const isMemberAdmin = chat.adminIds?.includes(m.id);
              const canManage = isOwnerOrAdmin && !isMemberOwner && m.id !== meId;
              return el("div", { class: "info-panel-member-row" }, [
                el("button", { class: "info-panel-member-profile-btn", onclick: () => openProfileDialog(m.id) }, [
                  Avatar({ name: m.name, color: m.avatarColor, image: m.avatarImage, size: 32 }),
                  el("span", { class: "info-panel-member-name" }, [
                    m.name,
                    isMemberOwner
                      ? el("span", { class: "info-panel-role-tag owner" }, [el("span", { html: iconSvg("Crown", 11) }), " владелец"])
                      : isMemberAdmin
                        ? el("span", { class: "info-panel-role-tag admin" }, [el("span", { html: iconSvg("Shield", 11) }), " админ"])
                        : null,
                    chat.restrictions?.[m.id] ? el("span", { class: "info-panel-role-tag restricted", title: "Не может писать" }, [" ", el("span", { html: iconSvg("Lock", 11) })]) : null,
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
