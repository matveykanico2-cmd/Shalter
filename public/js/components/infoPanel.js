import { el } from "../lib/dom.js";
import { api } from "../api.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openReportDialog } from "./reportDialog.js";
import { openProfileDialog } from "./profileDialog.js";
import { openChoiceDialog } from "./confirmDialog.js";
import { levelForPoints, pointsToNextLevel } from "../lib/groupLevels.js";
import { openEditChatDialog } from "./editChatDialog.js";
import { safetyLabelInfo } from "../lib/safetyLabels.js";
import { isChatOwner, isChatAdmin, memberRoleLabel } from "../lib/chatRoles.js";
import { VerifiedBadge } from "./verifiedBadge.js";
import { openChannelStats } from "./channelStats.js";

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
  const isDm = chat.type === "dm";
  const title = isDm ? (chat.otherUser?.name ?? chat.title) : chat.title;
  const isOwnerOrAdmin = isChatAdmin(chat, meId);
  // Either DM party can set the timer (it's a mutual chat property, same as
  // Telegram); for groups/channels it's owner/admin-only, same bar as the
  // other chat-wide settings (restrict/points aren't member-settable either).
  const canSetAutoDelete = isDm || isOwnerOrAdmin;

  // The label everyone in the chat sees next to this member. Owner-only, so it's
  // a plain prompt rather than a whole dialog — it's one short string.
  async function editTitle(member) {
    const current = chat.memberTitles?.[member.id] ?? "";
    const next = prompt(`Подпись для ${member.name} (видна всем). Пусто — вернуть обычную роль.`, current);
    if (next === null) return;
    try {
      const { chat: updated } = await api.setMemberTitle(chat.id, member.id, next);
      onChatUpdated?.(updated);
    } catch (err) {
      alert(err.message || "Не удалось изменить подпись");
    }
  }

  function openMemberMenu(e, member) {
    const isAdmin = chat.adminIds?.includes(member.id);
    const isModerator = chat.moderatorIds?.includes(member.id);
    const isOwner = isChatOwner(chat, member.id);
    const iAmOwner = isChatOwner(chat, meId);
    const isRestricted = !!chat.restrictions?.[member.id];

    // An owner's row still has actions — a co-owner can be demoted, and their
    // title can be changed — so it isn't a dead end any more.
    if (isOwner) {
      const items = [];
      if (iAmOwner) {
        items.push({ icon: "Edit", label: "Изменить подпись", onClick: () => editTitle(member) });
        const ownerCount = new Set([...(chat.ownerIds ?? []), chat.ownerId].filter(Boolean)).size;
        if (ownerCount > 1 && member.id !== meId) {
          items.push({
            icon: "Users",
            label: "Снять права владельца",
            danger: true,
            onClick: () => onMemberAction(member.id, "unowner"),
          });
        }
      }
      openDropdownMenu({ x: e.clientX, y: e.clientY }, items.length ? items : [{ icon: "Star", label: "Владелец чата", onClick: () => {} }]);
      return;
    }

    const items = [
      {
        icon: "Users",
        label: isAdmin ? "Снять права администратора" : "Сделать администратором",
        onClick: () => onMemberAction(member.id, isAdmin ? "demote" : "promote"),
      },
      {
        icon: "Shield",
        label: isModerator ? "Снять модератора" : "Сделать модератором",
        onClick: () => onMemberAction(member.id, isModerator ? "unmod" : "mod"),
      },
    ];
    if (iAmOwner) {
      // A chat can have several owners, so this adds one rather than handing the
      // chat over — it still asks, because an owner can do everything you can.
      items.push({
        icon: "Star",
        label: "Сделать владельцем",
        danger: true,
        onClick: () => {
          if (confirm(`Сделать ${member.name} владельцем чата? У него будут те же права, что у вас, включая назначение владельцев.`)) {
            onMemberAction(member.id, "owner");
          }
        },
      });
      items.push({ icon: "Edit", label: "Изменить подпись", onClick: () => editTitle(member) });
    }
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
            // Same fallback the image line below already had: a DM's own chat
            // row carries no avatarColor, so passing it alone left the avatar
            // with no background at all — a white letter on white, invisible.
            color: chat.otherUser?.avatarColor ?? chat.avatarColor,
            image: chat.otherUser?.avatarImage ?? chat.avatarImage,
            size: 72,
            isPremium: isDm && chat.otherUser?.isPremium,
            isDeveloper: isDm && chat.otherUser?.isDeveloper,
            orbit: true,
          }),
          el("p", { class: "info-panel-title" }, [
            title,
            VerifiedBadge(isDm ? chat.otherUser : chat, 16),
            isDm && chat.otherUser?.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 16) }) : null,
            isDm && chat.otherUser?.isPremium ? el("span", { class: "premium-mini-badge", html: iconSvg("Crown", 16) }) : null,
            isDm && safetyLabelInfo(chat.otherUser?.safetyLabel)
              ? el(
                  "span",
                  { class: `safety-badge safety-${chat.otherUser.safetyLabel}`, title: safetyLabelInfo(chat.otherUser.safetyLabel).hint },
                  safetyLabelInfo(chat.otherUser.safetyLabel).short
                )
              : null,
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
      // Description, if there is one — it's part of what a channel *is*, and
      // until now it was stored and never shown anywhere.
      !isDm && chat.description
        ? el("p", { class: "info-panel-description" }, chat.description)
        : null,
      !isDm && chat.isPublic && chat.username
        ? el("p", { class: "info-panel-handle mono" }, `@${chat.username}`)
        : null,
      // Editing the chat itself: name, picture, description, public link and
      // the colour palette. Owners/admins only — the server checks again.
      !isDm && isOwnerOrAdmin
        ? el("button", { class: "info-panel-row", onclick: () => openEditChatDialog(chat, onChatUpdated) }, [
            el("span", { class: "info-panel-row-icon", html: iconSvg("Edit", 15) }),
            `Редактировать ${chat.type === "channel" ? "канал" : "группу"}`,
          ])
        : null,
      // Verifying the chat itself — a channel or group, not a person. The
      // per-account check lives on the profile (adminUserPanel.js); this is the
      // only place a *chat* can be given one.
      !isDm && isShalterAdmin
        ? el(
            "button",
            {
              class: "info-panel-row",
              onclick: async () => {
                try {
                  const { chat: updated } = await api.adminSetChatVerified(chat.id, !chat.isVerified);
                  onChatUpdated?.(updated);
                } catch (err) {
                  alert(err.message || "Не удалось изменить верификацию");
                }
              },
            },
            [
              el("span", { class: "info-panel-row-icon", html: iconSvg("Verified", 15) }),
              chat.isVerified ? "Снять галочку верификации" : `Верифицировать ${chat.type === "channel" ? "канал" : "группу"}`,
            ]
          )
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
                    label: `${g.emoji} ${g.name} — ⭐ ${g.priceStars}`,
                    onClick: () => onDeliverGift(g.id, chat.otherUser.id),
                  })),
                  { search: "Поиск подарка" }
                ),
            },
            "🎁 Отправить подарок"
          )
        : null,
      el("button", { class: "info-panel-row", onclick: onToggleMute }, chat.muted ? "Включить уведомления" : "Отключить уведомления"),
      // Статистика — только тем, кто ведёт канал (сервер проверяет то же
      // самое). Просмотры и комментарии копились и раньше, но посмотреть на
      // них целиком было негде.
      chat.type === "channel" && isOwnerOrAdmin
        ? el("button", { class: "info-panel-row", onclick: () => openChannelStats(chat) }, "Статистика канала")
        : null,
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
              const isMemberOwner = isChatOwner(chat, m.id);
              const isMemberAdmin = chat.adminIds?.includes(m.id);
              // An owner's row is manageable by another owner now: co-owners can be
              // demoted and every role can be re-titled.
              const canManage = isOwnerOrAdmin && m.id !== meId && (!isMemberOwner || isChatOwner(chat, meId));
              // The owner-set label wins over the real role — that's what it's for.
              const roleLabel = memberRoleLabel(chat, m.id);
              const customTitle = !!chat.memberTitles?.[m.id];
              return el("div", { class: "info-panel-member-row" }, [
                el("button", { class: "info-panel-member-profile-btn", onclick: () => openProfileDialog(m.id) }, [
                  Avatar({ name: m.name, color: m.avatarColor, image: m.avatarImage, size: 32 }),
                  el("span", { class: "info-panel-member-name" }, [
                    m.name,
                    roleLabel
                      ? el(
                          "span",
                          {
                            class: `info-panel-role-tag ${customTitle ? "custom" : isMemberOwner ? "owner" : isMemberAdmin ? "admin" : "mod"}`,
                          },
                          [
                            customTitle ? null : el("span", { html: iconSvg(isMemberOwner ? "Crown" : "Shield", 11) }),
                            ` ${roleLabel}`,
                          ].filter(Boolean)
                        )
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
