import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { openDropdownMenu } from "../components/dropdownMenu.js";
import { MessageBubble } from "../components/messageBubble.js";
import { Composer } from "../components/composer.js";
import { InfoPanel } from "../components/infoPanel.js";
import { openForwardDialog } from "../components/forwardDialog.js";
import { openChoiceDialog } from "../components/confirmDialog.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { navigate } from "../router.js";
import { placeCall as placeCallController } from "../lib/callController.js";
import { onWsMessage } from "../lib/wsClient.js";

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

  let replyingTo = null;
  let editingMessage = null;
  let infoOpen = false;
  let pinIndex = 0;
  let typingUserId = null;
  let iBlockedThem = !!chat.otherUser && !!me.blockedUserIds?.includes(chat.otherUser.id);
  let messagesCount = messages.length;

  const isDm = chat.type === "dm" || chat.type === "secret";
  const other = chat.otherUser;
  const isChannel = chat.type === "channel";
  const isChannelAdmin = isChannel && (chat.ownerId === me.id || chat.adminIds?.includes(me.id));

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

  async function handleSend(text, attachments) {
    const replyToId = replyingTo?.id ?? null;
    replyingTo = null;
    try {
      if (isChannel) await api.publishPost(chat.id, text, attachments);
      else await api.sendMessage(chat.id, text, { replyToId, attachments });
    } catch (err) {
      alert(err.message || "Не удалось отправить сообщение");
    }
    renderComposer();
    await refreshMessages();
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
            Avatar({ name: other?.name ?? title, color: chat.avatarColor, image: isDm ? other?.avatarImage : chat.avatarImage, size: 38, online: isDm ? other?.online : undefined }),
            el("div", { class: "chat-header-titles" }, [
              el("p", { class: "chat-header-title" }, [chat.type === "secret" ? el("span", { html: iconSvg("Lock", 13) }) : null, title]),
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

  function renderInfoPanel() {
    clear(infoSlot);
    if (infoOpen) {
      infoSlot.appendChild(
        InfoPanel({
          chat,
          members,
          isBlocked: iBlockedThem,
          meId: me.id,
          onClose: () => setInfoOpen(false),
          onToggleMute: toggleMute,
          onToggleBlock: toggleBlock,
          onMemberAction: handleMemberAction,
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
    composerSlot.appendChild(
      Composer({
        chatId: chat.id,
        replyingTo,
        editingMessage,
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
      })
    );
  }

  renderHeader();
  renderList();
  renderComposer();
  renderInfoPanel();
  mount(root, wrap);
  list.scrollTo({ top: list.scrollHeight });

  const messagesIv = setInterval(refreshMessages, 3000);
  const typingIv = setInterval(async () => {
    const r = await api.getTyping(chat.id);
    typingUserId = r.typingUserId;
    renderHeader();
  }, 1500);

  const unsubPresence = onWsMessage("presence:update", (msg) => {
    if (!other || msg.userId !== other.id) return;
    other.online = msg.online;
    other.lastSeen = msg.lastSeen;
    renderHeader();
  });

  root._cleanup = () => {
    clearInterval(messagesIv);
    clearInterval(typingIv);
    unsubPresence();
  };
}
