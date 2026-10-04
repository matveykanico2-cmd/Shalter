import { openCommunityPanel } from "./communityList.js";
import { openCreateChatDialog } from "./createChatDialog.js";
import { askText } from "./confirmDialog.js";
import { askConfirm } from "./confirmDialog.js";
import { el } from "../lib/dom.js";
import { PremiumStar } from "./premiumStar.js";
import { api } from "../api.js";
import { navigate } from "../router.js";
import { iconSvg } from "../icons.js";
import { Avatar, videoAvatarUrl } from "./avatar.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openReportDialog } from "./reportDialog.js";
import { openProfileDialog, infoRow, birthdayText, isBirthdayToday } from "./profileDialog.js";
import { statusLabel, plural } from "../lib/presence.js";
import { openChoiceDialog } from "./confirmDialog.js";
import { levelForPoints, pointsToNextLevel } from "../lib/groupLevels.js";
import { openEditChatDialog } from "./editChatDialog.js";
import { safetyLabelInfo } from "../lib/safetyLabels.js";
import { isChatOwner, isChatAdmin, memberRoleLabel } from "../lib/chatRoles.js";
import { isChatMuted } from "../lib/chatSort.js";
import { VerifiedBadge } from "./verifiedBadge.js";
import { ProfileStatusBadge } from "./profileStatusBadge.js";
import { openChannelStats } from "./channelStats.js";
import { setState } from "../state.js";

const similarCache = new Map();

// «Похожие каналы» — горизонтальная лента, как в Telegram. Панель
// перерисовывается часто, поэтому ответ кэшируется на минуту.
function SimilarChannels(chat) {
  const box = el("div", { class: "similar-channels", hidden: true });
  const cached = similarCache.get(chat.id);
  const load = cached && Date.now() - cached.at < 60_000 ? Promise.resolve(cached.data) : api.similarChannels(chat.id).then((r) => r.channels);
  load
    .then((channels) => {
      similarCache.set(chat.id, { at: Date.now(), data: channels });
      if (!channels?.length) return;
      box.hidden = false;
      box.append(
        el("p", { class: "list-section-label" }, "Похожие каналы"),
        el(
          "div",
          { class: "similar-channels-row" },
          channels.map((c) =>
            el(
              "button",
              {
                class: "similar-channel",
                "data-ripple": "",
                title: c.title,
                onclick: async () => {
                  if (!c.isMember) {
                    try {
                      await api.subscribeChannel(c.id);
                      const r = await api.listChats();
                      setState({ chats: r.chats });
                    } catch (err) {
                      alert(err.message || "Не удалось подписаться");
                      return;
                    }
                  }
                  navigate(`/chat/${c.id}`);
                },
              },
              [
                el("span", { class: "similar-channel-avatar" }, [
                  Avatar({ name: c.title, color: c.avatarColor, image: c.avatarImage, size: 56 }),
                  el("span", { class: "similar-channel-count" }, [el("span", { html: iconSvg("Users", 10) }), compactCount(c.subscriberCount)]),
                ]),
                el("span", { class: "similar-channel-title" }, c.title),
              ]
            )
          )
        )
      );
    })
    .catch(() => {});
  return box;
}

function compactCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

const RESTRICT_DURATIONS = [
  { label: "На 1 час", hours: 1 },
  { label: "На 1 день", hours: 24 },
  { label: "На 1 неделю", hours: 24 * 7 },
  { label: "Навсегда", hours: null },
];

const AUTO_DELETE_DURATIONS = [
  { label: "Выключено", seconds: null },
  { label: "1 день", seconds: 24 * 3600 },
  { label: "1 неделя", seconds: 7 * 24 * 3600 },
  { label: "1 месяц", seconds: 30 * 24 * 3600 },
];

function sortMembers(chat, members) {
  const rank = (m) => (isChatOwner(chat, m.id) ? 0 : chat.adminIds?.includes(m.id) ? 1 : chat.moderatorIds?.includes(m.id) ? 2 : 3);
  return [...members].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.online ? 1 : 0) - (a.online ? 1 : 0) ||
      String(b.lastSeen ?? "").localeCompare(String(a.lastSeen ?? ""))
  );
}

function autoDeleteLabel(seconds) {
  return AUTO_DELETE_DURATIONS.find((d) => d.seconds === seconds)?.label ?? "Выключено";
}

const profileCache = new Map();
const PROFILE_TTL_MS = 30_000;

function loadProfile(userId) {
  const hit = profileCache.get(userId);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.promise;
  const promise = api.getUser(userId).catch(() => null);
  profileCache.set(userId, { at: Date.now(), promise });
  return promise;
}

function DmProfileRows(otherUser) {
  const slot = el("div", { class: "profile-info-card info-panel-profile-rows" });
  loadProfile(otherUser.id).then((res) => {
    const u = res?.user;
    if (!u) return;
    const rows = [
      u.phone ? infoRow({ icon: "Phone", value: u.phone, label: "Телефон", mono: true, copy: u.phone }) : null,
      u.username ? infoRow({ icon: "At", value: `@${u.username}`, label: "Юзернейм", accent: true, copy: `@${u.username}` }) : null,
      u.bio ? infoRow({ icon: "Info", value: u.bio, label: u.isBot ? "Описание" : "О себе", multiline: true }) : null,
      u.birthday
        ? infoRow({
            icon: "Gift",
            value: isBirthdayToday(u.birthday) ? `🎉 Сегодня день рождения · ${birthdayText(u.birthday)}` : birthdayText(u.birthday),
            label: "День рождения",
          })
        : null,
      res.commonGroupsCount > 0
        ? infoRow({
            icon: "Users",
            value: `${res.commonGroupsCount} ${plural(res.commonGroupsCount, "общая группа", "общие группы", "общих групп")}`,
            label: "Общие группы",
            onClick: () => openProfileDialog(otherUser.id),
          })
        : null,
    ].filter(Boolean);
    slot.append(...rows);
  });
  return slot;
}

function membersLine(chat, members) {
  const count = members.length || (chat.memberIds ?? []).length;
  const noun = chat.type === "channel" ? plural(count, "подписчик", "подписчика", "подписчиков") : plural(count, "участник", "участника", "участников");
  const online = members.filter((m) => m.online).length;
  return online > 1 && chat.type !== "channel" ? `${count} ${noun}, ${online} в сети` : `${count} ${noun}`;
}

// «Входит в сообщество …» — подгружается отдельно; владельцу/админу без
// сообщества — кнопки «Создать сообщество» и «Добавить в своё».
function CommunityRow(chat, canManage) {
  const slot = el("div", { class: "community-row-slot" });
  api
    .communityOfChat(chat.id)
    .then(async ({ community }) => {
      if (community) {
        slot.replaceChildren(
          el("button", { class: "info-community-link", onclick: () => openCommunityPanel(community.id) }, [
            el("span", { html: iconSvg("Users", 16) }),
            el("span", {}, ["Сообщество: ", el("b", {}, community.title)]),
          ])
        );
        return;
      }
      if (!canManage) return;
      const { communities } = await api.myCommunities().catch(() => ({ communities: [] }));
      slot.replaceChildren(
        el("div", { class: "info-community-actions" }, [
          el("button", {
            class: "settings-add-account-btn",
            onclick: () => openCreateCommunityTab(chat),
          }, "Создать сообщество"),
          ...communities.map((c) =>
            el("button", {
              class: "settings-add-account-btn",
              onclick: async () => {
                try {
                  await api.addCommunityChat(c.id, chat.id);
                  openCommunityPanel(c.id);
                } catch (err) {
                  alert(err.message || "Не удалось добавить");
                }
              },
            }, `Добавить в «${c.title}»`)
          ),
        ])
      );
    })
    .catch(() => {});
  return slot;
}

export function InfoPanel({ chat, members, isBlocked, meId, isMePremium, isShalterAdmin, gifts, onClose, onToggleMute, onToggleBlock, onMemberAction, onTogglePremium, onDeliverGift, onAddMember, onRestrictMember, onVoteForGroup, onSetAutoDelete, onChatUpdated }) {
  const isDm = chat.type === "dm";
  const title = isDm ? (chat.otherUser?.name ?? chat.title) : chat.title;
  const isOwnerOrAdmin = isChatAdmin(chat, meId);
  const canSetAutoDelete = isDm || isOwnerOrAdmin;

  async function editTitle(member) {
    const current = chat.memberTitles?.[member.id] ?? "";
    const self = member.id === meId;
    const next = (await askText(self ? "Ваш тег в группе (виден всем, до 24 символов). Пусто — убрать." : `Тег для ${member.name} (виден всем, до 24 символов). Пусто — вернуть обычную роль.`, current));
    if (next === null) return;
    try {
      const { chat: updated } = await api.setMemberTitle(chat.id, member.id, next);
      onChatUpdated?.(updated);
    } catch (err) {
      alert(err.message || "Не удалось изменить тег");
    }
  }

  function transferItem(member) {
    return {
      icon: "Star",
      label: "Передать права владельца",
      danger: true,
      onClick: async () => {
        const kind = chat.type === "channel" ? "канала" : "группы";
        if ((await askConfirm(`Передать ${member.name} права владельца ${kind}? Вы останетесь администратором, но вернуть права сможет только новый владелец.`))) {
          onMemberAction(member.id, "transfer");
        }
      },
    };
  }

  function openMemberMenu(e, member) {
    const isAdmin = chat.adminIds?.includes(member.id);
    const isModerator = chat.moderatorIds?.includes(member.id);
    const isOwner = isChatOwner(chat, member.id);
    const iAmOwner = isChatOwner(chat, meId);
    const isRestricted = !!chat.restrictions?.[member.id];

    if (isOwner) {
      const items = [];
      if (iAmOwner) {
        items.push({ icon: "Edit", label: "Изменить тег", onClick: () => editTitle(member) });
        const ownerCount = new Set([...(chat.ownerIds ?? []), chat.ownerId].filter(Boolean)).size;
        if (ownerCount > 1 && member.id !== meId) {
          items.push({
            icon: "Users",
            label: "Снять права владельца",
            danger: true,
            onClick: () => onMemberAction(member.id, "unowner"),
          });
        }
        if (member.id !== meId && !member.isBot) items.push(transferItem(member));
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
      items.push({
        icon: "Star",
        label: "Сделать владельцем",
        danger: true,
        onClick: async () => {
          if ((await askConfirm(`Сделать ${member.name} владельцем чата? У него будут те же права, что у вас, включая назначение владельцев.`))) {
            onMemberAction(member.id, "owner");
          }
        },
      });
      items.push({ icon: "Edit", label: "Изменить тег", onClick: () => editTitle(member) });
      if (!member.isBot) items.push(transferItem(member));
    } else if (!isAdmin) {
      items.push({ icon: "Edit", label: "Изменить тег", onClick: () => editTitle(member) });
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
    items.push({
      icon: "Lock",
      label: "Заблокировать",
      danger: true,
      onClick: async () => {
        if ((await askConfirm(`Заблокировать ${member.name}? Он будет удалён и не сможет вернуться, пока его не разблокируют.`))) {
          onMemberAction(member.id, "ban");
        }
      },
    });
    openDropdownMenu({ x: e.clientX, y: e.clientY }, items);
  }

  const panelEl = el("aside", { class: "info-panel" }, [
    el("div", { class: "info-panel-header" }, [
      el("h2", {}, isDm ? "Профиль" : chat.type === "channel" ? "Канал" : "Группа"),
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
            color: chat.otherUser?.avatarColor ?? chat.avatarColor,
            image: chat.otherUser?.avatarImage ?? chat.avatarImage,
            video: videoAvatarUrl(chat.otherUser),
            size: 120,
            isPremium: isDm && chat.otherUser?.isPremium,
            isDeveloper: isDm && chat.otherUser?.isDeveloper,
            orbit: true,
          }),
          el("p", { class: "info-panel-title" }, [
            title,
            VerifiedBadge(isDm ? chat.otherUser : chat, 16),
            isDm && chat.otherUser?.isDeveloper ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 16) }) : null,
            isDm && chat.otherUser?.isPremium ? PremiumStar({ size: 18, seed: chat.otherUser.id, title: "Shalter Premium" }) : null,
            isDm ? ProfileStatusBadge(chat.otherUser, 18) : null,
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
          isDm && chat.otherUser
            ? el("p", { class: `info-panel-subtitle${chat.otherUser.online ? " online" : ""}` }, statusLabel(chat.otherUser) ?? "был(а) недавно")
            : !isDm
              ? el("p", { class: "info-panel-subtitle" }, membersLine(chat, members))
              : null,
        ]
      ),
      isDm && chat.otherUser ? DmProfileRows(chat.otherUser) : null,
      !isDm && !chat.secret ? CommunityRow(chat, isOwnerOrAdmin) : null,
      chat.type === "group" || chat.type === "channel"
        ? el("div", { class: "info-panel-card tw-boost-card" }, [
            el("button", { type: "button", class: "info-panel-row tw-boost-row", onclick: onVoteForGroup }, [
              el("span", { class: "info-panel-row-icon tw-boost-row-icon", html: iconSvg("Zap", 20) }),
              el("span", { class: "tw-boost-row-body" }, [
                el("span", { class: "tw-boost-row-title" }, `Бусты · уровень ${levelForPoints(chat.points)}`),
                el(
                  "span",
                  { class: "tw-boost-row-sub" },
                  pointsToNextLevel(chat.points) != null
                    ? `${chat.points ?? 0} ${pluralBoost(chat.points ?? 0)} · до уровня ${levelForPoints(chat.points) + 1} ещё ${pointsToNextLevel(chat.points)}`
                    : `${chat.points ?? 0} ${pluralBoost(chat.points ?? 0)} · максимальный уровень`
                ),
              ]),
              el("span", { class: "tw-boost-row-action" }, isMePremium ? "Бустнуть" : "Premium"),
            ]),
          ])
        : null,
      !isDm && (chat.description || (chat.isPublic && chat.username))
        ? el("div", { class: "profile-info-card" }, [
            chat.description ? infoRow({ icon: "Info", value: chat.description, label: "Описание", multiline: true }) : null,
            chat.isPublic && chat.username
              ? infoRow({
                  icon: "Globe",
                  value: `${location.host}/u/${chat.username}`,
                  label: "Ссылка",
                  accent: true,
                  copy: `${location.origin}/u/${chat.username}`,
                })
              : null,
          ].filter(Boolean))
        : null,
      !isDm && isOwnerOrAdmin
        ? el("button", { class: "info-panel-row", onclick: () => openEditChatDialog(chat, onChatUpdated) }, [
            el("span", { class: "info-panel-row-icon", html: iconSvg("Edit", 22) }),
            `Редактировать ${chat.type === "channel" ? "канал" : "группу"}`,
          ])
        : null,
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
              el("span", { class: "info-panel-row-icon", html: iconSvg("Verified", 22) }),
              chat.isVerified ? "Снять галочку верификации" : `Верифицировать ${chat.type === "channel" ? "канал" : "группу"}`,
            ]
          )
        : null,
      isDm && chat.otherUser && isShalterAdmin
        ? el(
            "button",
            { class: "info-panel-row", onclick: () => onTogglePremium(chat.otherUser.id, !chat.otherUser.isPremium) },
            [el("span", { class: "info-panel-row-icon", html: iconSvg("Star", 22) }), chat.otherUser.isPremium ? "Забрать Shalter Premium" : "Выдать Shalter Premium (30 дней)"]
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
            [el("span", { class: "info-panel-row-icon", html: iconSvg("Gift", 22) }), "Отправить подарок"]
          )
        : null,
      el("button", { class: "info-panel-row", onclick: onToggleMute }, [el("span", { class: "info-panel-row-icon", html: iconSvg(isChatMuted(chat) ? "Bell" : "BellOff", 22) }), isChatMuted(chat) ? "Включить уведомления" : "Отключить уведомления"]),
      chat.type === "channel" && isOwnerOrAdmin
        ? el("button", { class: "info-panel-row", onclick: () => openChannelStats(chat) }, [el("span", { class: "info-panel-row-icon", html: iconSvg("BarChart", 22) }), "Статистика канала"])
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
            [el("span", { class: "info-panel-row-icon", html: iconSvg("Clock", 22) }), `Автоудаление сообщений: ${autoDeleteLabel(chat.autoDeleteSeconds)}`]
          )
        : null,
      chat.type === "channel" ? SimilarChannels(chat) : null,

      isDm ? el("button", { class: "info-panel-row danger", onclick: onToggleBlock }, [el("span", { class: "info-panel-row-icon", html: iconSvg("Lock", 22) }), isBlocked ? "Разблокировать" : "Заблокировать"]) : null,
      isDm && chat.otherUser
        ? el(
            "button",
            { class: "info-panel-row danger", onclick: () => openReportDialog("user", chat.otherUser.id, chat.otherUser.name) },
            [el("span", { class: "info-panel-row-icon", html: iconSvg("Shield", 22) }), "Пожаловаться"]
          )
        : null,
      !isDm
        ? el(
            "button",
            { class: "info-panel-row danger", onclick: () => openReportDialog("chat", chat.id, title) },
            [el("span", { class: "info-panel-row-icon", html: iconSvg("Shield", 22) }), `Пожаловаться на ${chat.type === "channel" ? "канал" : "группу"}`]
          )
        : null,
      !isDm && (chat.type !== "channel" || isOwnerOrAdmin)
        ? el("div", { class: "info-panel-members" }, [
            el("div", { class: "info-panel-members-header" }, [
              el("p", { class: "list-section-label" }, `${chat.type === "channel" ? "Подписчики" : "Участники"} (${members.length})`),
              isOwnerOrAdmin
                ? el("button", { class: "icon-btn", title: "Добавить участника", html: iconSvg("Plus", 15), onclick: onAddMember })
                : null,
            ]),
            ...sortMembers(chat, members).map((m) => {
              const isMemberOwner = isChatOwner(chat, m.id);
              const isMemberAdmin = chat.adminIds?.includes(m.id);
              const canManage = isOwnerOrAdmin && m.id !== meId && (!isMemberOwner || isChatOwner(chat, meId));
              const roleLabel = memberRoleLabel(chat, m.id);
              const customTitle = !!chat.memberTitles?.[m.id];
              return el("div", { class: "info-panel-member-row" }, [
                el("button", { class: "info-panel-member-profile-btn", onclick: () => openProfileDialog(m.id) }, [
                  Avatar({ name: m.name, color: m.avatarColor, image: m.avatarImage, size: 32, online: m.online }),
                  el("span", { class: "info-panel-member-text" }, [
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
                  el("span", { class: `info-panel-member-status${m.online ? " online" : ""}` }, m.id === meId ? "это вы" : statusLabel(m) ?? "был(а) недавно"),
                  ]),
                ]),
                canManage
                  ? el("button", { class: "icon-btn", html: iconSvg("More", 15), onclick: (e) => openMemberMenu(e, m) })
                  : m.id === meId && chat.type === "group" && (isOwnerOrAdmin || chat.permissions?.setOwnTag !== false)
                    ? el("button", { class: "icon-btn", title: "Мой тег", html: iconSvg("Edit", 14), onclick: () => editTitle(m) })
                    : null,
              ]);
            }),
          ])
        : null,
    ]),
  ]);
  groupIntoCards(panelEl.querySelector(".info-panel-body"));
  return panelEl;
}

// Соседние строки панели собираем в карточки, как секции sidebar-right в tweb.
function groupIntoCards(body) {
  if (!body) return;
  let card = null;
  for (const child of [...body.children]) {
    if (child.classList.contains("info-panel-row")) {
      if (!card) {
        card = el("div", { class: "info-panel-card" });
        child.before(card);
      }
      card.appendChild(child);
    } else card = null;
  }
}


// «Новое сообщество» — тот же интерфейс, что у группы: аватар, название,
// описание; текущий чат становится первым в сообществе.
function openCreateCommunityTab(chat) {
  openCreateChatDialog(
    "community",
    async (title, avatarImage, extra, tab) => {
      const { community } = await api.createCommunity({ title, description: extra.description, avatarImage, chatId: chat.id });
      tab.close({ all: true });
      openCommunityPanel(community.id);
    },
    { firstChatId: chat.id }
  );
}

function pluralBoost(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "буст";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "буста";
  return "бустов";
}
