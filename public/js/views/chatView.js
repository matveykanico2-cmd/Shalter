import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { openDropdownMenu } from "../components/dropdownMenu.js";
import { MessageBubble } from "../components/messageBubble.js";
import { Composer } from "../components/composer.js";
import { InfoPanel } from "../components/infoPanel.js";
import { openForwardDialog } from "../components/forwardDialog.js";
import { openChoiceDialog } from "../components/confirmDialog.js";
import { openMemberPickerDialog } from "../components/memberPickerDialog.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { navigate } from "../router.js";
import { placeCall as placeCallController } from "../lib/callController.js";
import { onWsMessage } from "../lib/wsClient.js";
import { paintWallpaper } from "../lib/wallpapers.js";
import { openWallpaperDialog } from "../components/wallpaperDialog.js";
import { openScheduledMessagesDialog } from "../components/scheduledMessagesDialog.js";
import { openThreadPanel } from "../components/threadPanel.js";
import { safetyLabelInfo } from "../lib/safetyLabels.js";

// Settings → Внешний вид → "Фон чата" sets the global default; a chat's own
// "…" → "Фон чата" (see openWallpaperDialog below) overrides it for just
// that conversation via settings.chatWallpapers[chatId] — private to this
// account, same as Telegram's own per-chat background.
function applyWallpaper(list, chatId) {
  const settings = getState().settings;
  const override = settings?.chatWallpapers?.[chatId];
  paintWallpaper(list, override ?? { id: settings?.chatWallpaper ?? "default", image: settings?.chatWallpaperImage });
}

// Date dividers between messages from different calendar days (Telegram's
// own "Сегодня"/"Вчера"/16 июля" pills above the day's first message) — pure
// local-time comparison, same as timeLabel()'s toLocaleTimeString elsewhere
// in this file, so a divider lands on the day the message actually shows
// under, not its UTC day if that happens to differ near midnight.
function sameDay(isoA, isoB) {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dayLabel(iso) {
  const now = new Date();
  if (sameDay(iso, now)) return "Сегодня";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(iso, yesterday)) return "Вчера";
  const d = new Date(iso);
  const opts = { day: "numeric", month: "long" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("ru-RU", opts);
}

function lastSeenLabel(user) {
  if (user.online) return "в сети";
  const d = new Date(user.lastSeen);
  return `был(а) в сети ${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} в ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

export async function ChatView(root, chatId) {
  const me = getState().user;
  let chat, members, messages;
  try {
    const chatRes = await api.getChat(chatId);
    chat = chatRes.chat;
    members = chatRes.members;
    messages = (await api.listMessages(chatId)).messages;
  } catch {
    mount(root, el("div", { class: "empty-chat" }, "Чат не найден"));
    return;
  }

  // That listMessages() call just marked this chat's messages read on the
  // server (see server/routes/messages.js) — clear the badge in the shared
  // chat-list state right away instead of waiting on its own poll/WS refetch
  // to notice the unreadCount changed.
  const { chats: sharedChats } = getState();
  if (sharedChats.some((c) => c.id === chatId && c.unreadCount > 0)) {
    setState({ chats: sharedChats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)) });
  }

  let replyingTo = null;
  let editingMessage = null;
  let draftText = chat.draft ?? "";
  let infoOpen = false;
  let pinIndex = 0;
  let typingUserId = null;
  let iBlockedThem = !!chat.otherUser && !!me.blockedUserIds?.includes(chat.otherUser.id);
  let messagesCount = messages.length;
  let isShalterAdmin = false;
  let gifts = [];

  const isDm = chat.type === "dm";
  const other = chat.otherUser;

  // Only DMs can ever show the grant-Premium/gift actions, so skip the extra
  // requests everywhere else — the real permission check is server-side
  // anyway (POST /api/premium/grant, /api/gifts/deliver), this only decides
  // whether to show the buttons.
  if (isDm && other) {
    Promise.all([api.getPremiumInfo(), api.listGifts()])
      .then(([info, giftsRes]) => {
        isShalterAdmin = info.isAdmin;
        gifts = giftsRes.gifts;
        if (isShalterAdmin) renderInfoPanel();
      })
      .catch(() => {});
  }
  const isChannel = chat.type === "channel";
  const isChannelAdmin = isChannel && (chat.ownerId === me.id || chat.adminIds?.includes(me.id));
  const isGroup = chat.type === "group";

  function jumpTo(id) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function refreshMessages() {
    const res = await api.listMessages(chat.id);
    const grew = res.messages.length > messagesCount;
    messages = res.messages;
    messagesCount = messages.length;
    renderList();
    if (grew) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }

  async function handleSend(text, attachments, extra) {
    const replyToId = replyingTo?.id ?? null;
    replyingTo = null;
    try {
      if (isChannel) await api.publishPost(chat.id, text, attachments);
      else await api.sendMessage(chat.id, text, { replyToId, attachments, ...extra });
    } catch (err) {
      alert(err.message || "Не удалось отправить сообщение");
    }
    draftText = "";
    renderComposer();
    await refreshMessages();
  }

  // Composer.js debounce-saves the draft server-side itself; this just
  // keeps the chat-list preview (chatListItem.js's `chat.draft` check) in
  // sync immediately, without waiting on that network round-trip or the
  // next chat-list poll.
  function handleDraftChange(text) {
    draftText = text;
    const { chats: sharedChats } = getState();
    if (sharedChats.some((c) => c.id === chat.id)) {
      setState({ chats: sharedChats.map((c) => (c.id === chat.id ? { ...c, draft: text } : c)) });
    }
  }

  async function handleForward(message, targetChatId) {
    const sender = members.find((u) => u.id === message.senderId);
    const title = isDm ? (other?.name ?? chat.title) : chat.title;
    await api.sendMessage(targetChatId, message.text, {
      attachments: message.attachments,
      forwardedFrom: { chatId: chat.id, chatTitle: title, senderId: message.senderId, senderName: sender?.name ?? "Аноним" },
    });
  }

  async function handleSaveEdit(text) {
    if (!editingMessage) return;
    const id = editingMessage.id;
    editingMessage = null;
    await api.editMessage(chat.id, id, text);
    renderComposer();
    await refreshMessages();
  }

  async function handleDelete(m, forEveryone) {
    await api.deleteMessage(chat.id, m.id, forEveryone);
    await refreshMessages();
  }

  async function handleReact(m, emoji) {
    const existing = m.reactions.find((r) => r.emoji === emoji);
    if (existing) {
      existing.userIds = existing.userIds.includes(me.id)
        ? existing.userIds.filter((u) => u !== me.id)
        : [...existing.userIds, me.id];
      m.reactions = m.reactions.filter((r) => r.userIds.length > 0);
    } else {
      m.reactions.push({ emoji, userIds: [me.id] });
    }
    renderList();
    await api.react(chat.id, m.id, emoji);
  }

  async function handleVote(m, optionIndex) {
    await api.votePoll(chat.id, m.id, optionIndex);
    await refreshMessages();
  }

  async function handlePin(m) {
    await api.pinMessage(chat.id, m.id, !m.pinned);
    await refreshMessages();
  }

  async function toggleMute() {
    chat.muted = !chat.muted;
    await api.patchChat(chat.id, { muted: chat.muted });
    renderHeader();
  }

  async function toggleBlock() {
    if (!other) return;
    iBlockedThem = !iBlockedThem;
    await api.setBlocked(other.id, iBlockedThem);
    renderComposer();
  }

  async function handleMemberAction(userId, role) {
    await api.setMemberRole(chat.id, userId, role);
    const { chat: updated, members: refreshedMembers } = await api.getChat(chat.id);
    Object.assign(chat, updated);
    members = refreshedMembers;
    renderHeader();
    renderInfoPanel();
  }

  async function handleRestrictMember(userId, until) {
    await api.restrictMember(chat.id, userId, until);
    const { chat: updated, members: refreshedMembers } = await api.getChat(chat.id);
    Object.assign(chat, updated);
    members = refreshedMembers;
    renderInfoPanel();
    renderComposer();
  }

  async function handleVoteForGroup() {
    try {
      const { chat: updated } = await api.voteForGroup(chat.id);
      Object.assign(chat, updated);
      renderInfoPanel();
    } catch (err) {
      alert(err.message || "Не удалось проголосовать");
    }
  }

  async function handleSetAutoDelete(seconds) {
    try {
      const { chat: updated } = await api.patchChat(chat.id, { autoDeleteSeconds: seconds });
      Object.assign(chat, updated);
      renderInfoPanel();
    } catch (err) {
      alert(err.message || "Не удалось изменить автоудаление");
    }
  }

  function handleAddMember() {
    openMemberPickerDialog(
      async (userIds) => {
        for (const userId of userIds) {
          try {
            await api.setMemberRole(chat.id, userId, "add");
          } catch (err) {
            alert(err.message || "Не удалось добавить участника");
          }
        }
        const { chat: updated, members: refreshedMembers } = await api.getChat(chat.id);
        Object.assign(chat, updated);
        members = refreshedMembers;
        renderHeader();
        renderInfoPanel();
      },
      { title: "Добавить участников", submitLabel: "Добавить", excludeIds: chat.memberIds }
    );
  }

  function handleClearHistory() {
    openChoiceDialog("Очистить историю чата", [
      {
        label: "Очистить только у себя",
        onClick: async () => {
          await api.clearHistory(chat.id, false);
          messages = [];
          renderList();
        },
      },
      {
        label: "Очистить у всех",
        danger: true,
        onClick: async () => {
          await api.clearHistory(chat.id, true);
          messages = [];
          renderList();
        },
      },
    ]);
  }

  function handleChooseWallpaper() {
    const settings = getState().settings;
    openWallpaperDialog({
      current: settings?.chatWallpapers?.[chat.id] ?? null,
      onSelect: async (wallpaper) => {
        const { settings: updated } = await api.setChatWallpaper(chat.id, wallpaper);
        setState({ settings: updated });
        applyWallpaper(list, chat.id);
      },
    });
  }

  async function handleLeaveOrDelete() {
    const isGroupLike = chat.type === "group" || chat.type === "channel";
    const label = chat.type === "channel" ? "отписаться от канала" : isGroupLike ? "покинуть группу" : "удалить чат";
    if (!confirm(`Вы уверены, что хотите ${label}?`)) return;
    if (isGroupLike) await api.leaveChat(chat.id);
    else await api.deleteChat(chat.id);
    navigate("/");
  }

  async function placeCall(kind) {
    await placeCallController(chat.id, kind, me);
  }

  const title = isDm ? (other?.name ?? chat.title) : chat.title;

  const header = el("header", { class: "chat-header" });
  const pinnedBar = el("div", { class: "pinned-bar-slot" });
  const list = el("div", { class: "message-list" });
  applyWallpaper(list, chat.id);
  const composerSlot = el("div", { class: "composer-slot" });
  const bodyBottomSlot = el("div", { class: "body-bottom-slot" });
  const mainCol = el("div", { class: "chat-main-col" }, [header, pinnedBar, list, bodyBottomSlot, composerSlot]);
  const infoSlot = el("div", { class: "info-panel-slot" });
  const wrap = el("div", { class: "chat-view" }, [mainCol, infoSlot]);

  function renderHeader() {
    clear(header);
    const subtitle = (() => {
      if (typingUserId) {
        if (isDm) return "печатает…";
        const typist = members.find((m) => m.id === typingUserId);
        if (typist) return `${typist.name} печатает…`;
      }
      if (chat.type === "bot") return "бот";
      if (isDm && other) return lastSeenLabel(other);
      if (chat.type === "group") return `${members.length} участников`;
      if (chat.type === "channel") return `${members.length} подписчиков`;
      return "";
    })();

    header.append(
      ...[
        el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
        el(
          "button",
          { class: "chat-header-info-btn", onclick: () => setInfoOpen(true) },
          [
            Avatar({
              name: other?.name ?? title,
              color: chat.avatarColor,
              image: isDm ? other?.avatarImage : chat.avatarImage,
              size: 38,
              online: isDm ? other?.online : undefined,
              isPremium: isDm && other?.isPremium,
              isDeveloper: isDm && other?.isDeveloper,
              orbit: true,
            }),
            el("div", { class: "chat-header-titles" }, [
              el("p", { class: "chat-header-title" }, [
                title,
                // Safety marker (server/db.js's safetyLabel) — shown in the
                // header of the open chat too, so it's on screen while the
                // conversation is actually happening, not only on the profile.
                isDm && safetyLabelInfo(other?.safetyLabel)
                  ? el(
                      "span",
                      { class: `safety-badge safety-mini safety-${other.safetyLabel}`, title: safetyLabelInfo(other.safetyLabel).hint },
                      safetyLabelInfo(other.safetyLabel).short
                    )
                  : null,
              ]),
              el("p", { class: "chat-header-subtitle" }, subtitle),
            ]),
          ]
        ),
        isDm || chat.type === "group"
          ? el("button", { class: "icon-btn", title: "Позвонить", html: iconSvg("Phone", 18), onclick: () => placeCall("audio") })
          : null,
        isDm || chat.type === "group"
          ? el("button", { class: "icon-btn", title: "Видеозвонок", html: iconSvg("Video", 18), onclick: () => placeCall("video") })
          : null,
        el("button", {
          class: "icon-btn",
          html: iconSvg("More", 18),
          onclick: (e) =>
            openDropdownMenu({ x: e.clientX, y: e.clientY }, [
              { icon: chat.muted ? "Bell" : "BellOff", label: chat.muted ? "Включить уведомления" : "Отключить уведомления", onClick: toggleMute },
              { icon: "Info", label: "Информация о чате", onClick: () => setInfoOpen(true) },
              { icon: "Image", label: "Фон чата", onClick: handleChooseWallpaper },
              { icon: "Clock", label: "Запланированные сообщения", onClick: () => openScheduledMessagesDialog(chat.id) },
              { icon: "Trash", label: "Очистить историю", onClick: handleClearHistory },
              {
                icon: "X",
                label: chat.type === "channel" ? "Отписаться от канала" : chat.type === "group" ? "Покинуть группу" : "Удалить чат",
                danger: true,
                onClick: handleLeaveOrDelete,
              },
            ]),
        }),
        el("button", { class: "icon-btn info-toggle", html: iconSvg("Info", 18), onclick: () => setInfoOpen(!infoOpen) }),
      ].filter(Boolean)
    );
  }

  function setInfoOpen(v) {
    infoOpen = v;
    renderInfoPanel();
  }

  async function toggleOtherPremium(userId, premium) {
    try {
      const { user } = await api.grantPremium(userId, premium);
      chat = { ...chat, otherUser: { ...chat.otherUser, isPremium: user.isPremium } };
      renderInfoPanel();
    } catch (err) {
      alert(err.message);
    }
  }

  async function deliverGiftToOther(giftId, userId) {
    try {
      const { user } = await api.deliverGift(giftId, userId);
      chat = { ...chat, otherUser: { ...chat.otherUser, isPremium: user.isPremium } };
      renderInfoPanel();
      await refreshMessages();
    } catch (err) {
      alert(err.message);
    }
  }

  function renderInfoPanel() {
    clear(infoSlot);
    if (infoOpen) {
      infoSlot.appendChild(
        InfoPanel({
          chat,
          members,
          isBlocked: iBlockedThem,
          meId: me.id,
          isShalterAdmin,
          gifts,
          onClose: () => setInfoOpen(false),
          onToggleMute: toggleMute,
          onToggleBlock: toggleBlock,
          onMemberAction: handleMemberAction,
          onTogglePremium: toggleOtherPremium,
          onDeliverGift: deliverGiftToOther,
          onAddMember: handleAddMember,
          onRestrictMember: handleRestrictMember,
          isMePremium: me.isPremium,
          onVoteForGroup: handleVoteForGroup,
          onSetAutoDelete: handleSetAutoDelete,
          // updateChat()'s response is the raw chat row — merge rather than
          // replace so the extra fields attachSummaries() adds (lastMessage,
          // unreadCount, draft, hasUnreadMention) survive a public/username
          // change instead of vanishing until the next full refetch.
          onChatUpdated: (updated) => {
            chat = { ...chat, ...updated };
            renderHeader();
            renderInfoPanel();
          },
        })
      );
    }
  }

  function renderPinnedBar() {
    clear(pinnedBar);
    const pinned = messages.filter((m) => m.pinned && !m.deleted);
    if (!pinned.length) return;
    pinnedBar.appendChild(
      el(
        "button",
        {
          class: "pinned-bar",
          onclick: () => {
            jumpTo(pinned[pinIndex % pinned.length].id);
            pinIndex++;
          },
        },
        [
          el("span", { html: iconSvg("Pin", 14) }),
          el("span", { class: "pinned-bar-text" }, pinned[pinIndex % pinned.length].text),
          pinned.length > 1 ? el("span", { class: "mono pinned-bar-count" }, String(pinned.length)) : null,
        ]
      )
    );
  }

  function renderList() {
    clear(list);
    if (!messages.length) {
      list.appendChild(el("p", { class: "empty-hint" }, "Сообщений пока нет — напишите первым"));
    }
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      if (!prev || !sameDay(prev.createdAt, m.createdAt)) {
        list.appendChild(el("div", { class: "date-divider" }, el("span", {}, dayLabel(m.createdAt))));
      }
      const showSender = (chat.type === "group" || chat.type === "channel") && (!prev || prev.senderId !== m.senderId);
      const sender = members.find((u) => u.id === m.senderId);
      const replyToMessage = m.replyToId ? messages.find((x) => x.id === m.replyToId) : undefined;
      list.appendChild(
        MessageBubble({
          message: m,
          me,
          sender,
          showSender,
          replyToMessage,
          members,
          handlers: {
            onReply: (msg) => {
              replyingTo = msg;
              editingMessage = null;
              renderComposer();
            },
            onEdit: (msg) => {
              editingMessage = msg;
              replyingTo = null;
              renderComposer();
            },
            onDelete: (msg) => {
              const mine = msg.senderId === me.id;
              openChoiceDialog(
                "Удалить сообщение",
                mine
                  ? [
                      { label: "Удалить только у себя", onClick: () => handleDelete(msg, false) },
                      { label: "Удалить у всех", danger: true, onClick: () => handleDelete(msg, true) },
                    ]
                  : [{ label: "Удалить у себя", danger: true, onClick: () => handleDelete(msg, false) }]
              );
            },
            onReact: handleReact,
            onPin: handlePin,
            onJumpTo: jumpTo,
            onForward: (msg) => openForwardDialog((targetChatId) => handleForward(msg, targetChatId)),
            onVote: handleVote,
            onKeyboardAction: (action) => handleSend(action, []),
            onOpenThread: isGroup ? (msg) => openThreadPanel({ chat, rootMessage: msg, members, me, onReplySent: refreshMessages }) : undefined,
          },
        })
      );
      if (isChannel && m.type !== "system" && chat.linkedDiscussionChatId) {
        list.appendChild(
          el(
            "button",
            {
              class: "post-comments-link",
              onclick: () => navigate(`/chat/${chat.linkedDiscussionChatId}`),
            },
            `💬 ${m.commentCount ?? 0} комментари${(m.commentCount ?? 0) === 1 ? "й" : "ев"}`
          )
        );
      }
      // Real threads (threadPanel.js) — group chats only (channels already
      // have their own comment mechanism above via the linked discussion
      // chat; a DM is just two people, nothing to thread).
      if (isGroup && m.type !== "system" && m.commentCount && !m.threadRootId) {
        list.appendChild(
          el(
            "button",
            { class: "post-comments-link", onclick: () => openThreadPanel({ chat, rootMessage: m, members, me, onReplySent: refreshMessages }) },
            `💬 ${m.commentCount} ответ${m.commentCount === 1 ? "" : m.commentCount < 5 ? "а" : "ов"}`
          )
        );
      }
    });
    renderPinnedBar();
  }

  function renderComposer() {
    clear(bodyBottomSlot);
    clear(composerSlot);
    if (iBlockedThem) {
      bodyBottomSlot.appendChild(
        el("div", { class: "blocked-bar" }, [
          el("p", {}, "Вы заблокировали этого пользователя"),
          el("button", { class: "btn-accent", onclick: toggleBlock }, "Разблокировать"),
        ])
      );
      return;
    }
    if (isChannel && !isChannelAdmin) {
      bodyBottomSlot.appendChild(el("p", { class: "channel-readonly-hint" }, "Публиковать в этот канал могут только администраторы"));
      return;
    }
    const restrictedUntil = chat.restrictions?.[me.id];
    if (restrictedUntil && (restrictedUntil === "forever" || restrictedUntil > new Date().toISOString())) {
      bodyBottomSlot.appendChild(
        el(
          "p",
          { class: "channel-readonly-hint" },
          restrictedUntil === "forever" ? "Вам запрещено писать в этом чате" : `Вам запрещено писать в этом чате до ${new Date(restrictedUntil).toLocaleString("ru-RU")}`
        )
      );
      return;
    }
    composerSlot.appendChild(
      Composer({
        chatId: chat.id,
        replyingTo,
        editingMessage,
        initialDraft: draftText,
        members: members.filter((u) => u.id !== me.id),
        onCancelReply: () => {
          replyingTo = null;
          renderComposer();
        },
        onCancelEdit: () => {
          editingMessage = null;
          renderComposer();
        },
        onSend: handleSend,
        onSaveEdit: handleSaveEdit,
        onDraftChange: handleDraftChange,
        onScheduled: () => openScheduledMessagesDialog(chat.id),
      })
    );
  }

  renderHeader();
  renderList();
  renderComposer();
  renderInfoPanel();
  mount(root, wrap);
  list.scrollTo({ top: list.scrollHeight });

  // WS push is the primary path for both messages and typing (near-instant);
  // the polling below only needs to catch up after a dropped/reconnecting
  // socket, so it can run at a much longer interval than before.
  const messagesIv = setInterval(refreshMessages, 15000);
  const typingIv = setInterval(async () => {
    const r = await api.getTyping(chat.id);
    typingUserId = r.typingUserId;
    renderHeader();
  }, 5000);

  const unsubPresence = onWsMessage("presence:update", (msg) => {
    if (!other || msg.userId !== other.id) return;
    other.online = msg.online;
    other.lastSeen = msg.lastSeen;
    renderHeader();
  });
  const unsubMessageNew = onWsMessage("message:new", (msg) => {
    if (msg.chatId !== chat.id) return;
    refreshMessages();
  });
  const unsubMessageUpdated = onWsMessage("message:updated", (msg) => {
    if (msg.chatId !== chat.id) return;
    refreshMessages();
  });
  const unsubMessageDeleted = onWsMessage("message:deleted", (msg) => {
    if (msg.chatId !== chat.id) return;
    refreshMessages();
  });
  // Someone else opened the chat and read our messages — refresh so the
  // sent/read checkmark (readByIds.length, see messageBubble.js) updates.
  const unsubMessageRead = onWsMessage("message:read", (msg) => {
    if (msg.chatId !== chat.id) return;
    refreshMessages();
  });
  // The push only signals "typing started" (mirroring how the composer only
  // pings on keystrokes, not on stop) — the server's typing state self-expires
  // after 4s (see server/data/typing.js), so clear it locally on the same
  // schedule instead of leaning on the slow poll to notice it's gone stale.
  let typingClearTimer = null;
  const unsubTyping = onWsMessage("typing:update", (msg) => {
    if (msg.chatId !== chat.id) return;
    typingUserId = msg.userId;
    renderHeader();
    clearTimeout(typingClearTimer);
    typingClearTimer = setTimeout(() => {
      typingUserId = null;
      renderHeader();
    }, 4000);
  });

  root._cleanup = () => {
    clearInterval(messagesIv);
    clearInterval(typingIv);
    clearTimeout(typingClearTimer);
    unsubPresence();
    unsubMessageNew();
    unsubMessageUpdated();
    unsubMessageDeleted();
    unsubMessageRead();
    unsubTyping();
  };
}
