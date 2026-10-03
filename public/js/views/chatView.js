import { el, mount, clear, appendAll } from "../lib/dom.js";
import { plural, statusLabel } from "../lib/presence.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { openDropdownMenu } from "../components/dropdownMenu.js";
import { MessageBubble, isCallLogMessage } from "../components/messageBubble.js";
import { Composer } from "../components/composer.js";
import { InfoPanel } from "../components/infoPanel.js";
import { openForwardDialog } from "../components/forwardDialog.js";
import { openChoiceDialog } from "../components/confirmDialog.js";
import { openDeleteChatDialog } from "../components/deleteChatDialog.js";
import { openChatCalendarDialog } from "../components/chatCalendarDialog.js";
import { openMemberPickerDialog } from "../components/memberPickerDialog.js";
import { api } from "../api.js";
import { getState, setState } from "../state.js";
import { playSentSound } from "../lib/ringtone.js";
import { isChatAdmin, isChatModerator } from "../lib/chatRoles.js";
import { messagePreview } from "../lib/messagePreview.js";
import { AudioPlayerBar } from "../components/audioPlayerBar.js";
import { noteMessageInChatList } from "../lib/chatListSync.js";
import { readCache, writeCache } from "../lib/localCache.js";
import { cachedUser, fetchUsers, rememberUser } from "../lib/userLookup.js";
import { takePrefetched } from "../lib/chatPrefetch.js";
import { navigate } from "../router.js";
import { placeCall as placeCallController, joinVoiceRoom } from "../lib/callController.js";
import { onWsMessage } from "../lib/wsClient.js";
import { paintWallpaper } from "../lib/wallpapers.js";
import { openMuteDurationDialog } from "../lib/muteDurations.js";
import { openWallpaperDialog } from "../components/wallpaperDialog.js";
import { openScheduledMessagesDialog } from "../components/scheduledMessagesDialog.js";
import { openThreadPanel } from "../components/threadPanel.js";
import { VerifiedBadge } from "../components/verifiedBadge.js";
import { PremiumStar } from "../components/premiumStar.js";
import { ProfileStatusBadge } from "../components/profileStatusBadge.js";
import { safetyLabelInfo } from "../lib/safetyLabels.js";
import { openMiniApp } from "../components/miniApp.js";
import { openDeleteMessageDialog } from "../components/deleteMessageDialog.js";
import { openLiveScreen } from "../components/liveScreen.js";
import { CHAT_ACTION_LABELS } from "../lib/chatAction.js";
import { isServerModerator } from "../lib/moderation.js";
import { openAd } from "../lib/adLink.js";
import { isChatMuted } from "../lib/chatSort.js";
import { TopicTabs } from "../components/topicTabs.js";

function applyWallpaper(list, chat) {
  const settings = getState().settings;
  const personal = settings?.chatWallpapers?.[chat.id];
  const shared = chat?.wallpaper;
  paintWallpaper(list, personal ?? shared ?? { id: settings?.chatWallpaper ?? "default", image: settings?.chatWallpaperImage });
}

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
  return statusLabel(user) ?? "был(а) недавно";
}

export async function ChatView(root, chatId) {
  const me = getState().user;
  let chat, members, messages;
  const PAGE_SIZE = 60;
  let hasMoreHistory = false;
  let loadingHistory = false;
  let firstUnreadId = null;
  let botCommands = null;
  let paidMessages = null;
  let searchQuery = "";
  let searchResults = null;
  // Темы группы: topicFilter — undefined («Все»), "general» или id темы.
  let topics = [];
  let topicFilter = undefined;
  const topicQuery = () => (chat?.topicsEnabled && topicFilter ? { topic: topicFilter } : {});
  const replyTargets = new Map();
  const rememberReplyTargets = (res) => {
    for (const [id, t] of Object.entries(res?.replyTargets ?? {})) replyTargets.set(id, t);
  };
  const cached = readCache(`chat.${chatId}`, me.id);
  let openedFromCache = false;
  let awaitingUnreadMark = false;
  if (cached?.chat && cached.messages?.length) {
    chat = cached.chat;
    members = cached.members ?? [];
    messages = cached.messages;
    hasMoreHistory = false;
    openedFromCache = true;
    awaitingUnreadMark = true;
  }

  try {
    if (openedFromCache) throw new Error("показано сохранённое");
    const [chatRes, first] = await (takePrefetched(chatId) ?? Promise.all([api.getChat(chatId), api.listMessages(chatId, { limit: PAGE_SIZE })]));
    chat = chatRes.chat;
    members = chatRes.members;
    botCommands = chatRes.commands ?? null;
    paidMessages = chatRes.paidMessages ?? null;
    messages = first.messages;
    hasMoreHistory = !!first.hasMore;
    rememberReplyTargets(first);
    firstUnreadId = first.firstUnreadId ?? null;
    writeCache(`chat.${chatId}`, me.id, { chat, members, messages: messages.slice(-PAGE_SIZE) });
  } catch {
    if (!openedFromCache) {
      mount(root, el("div", { class: "empty-chat" }, "Чат не найден"));
      return;
    }
  }

  const { chats: sharedChats } = getState();
  if (sharedChats.some((c) => c.id === chatId && (c.unreadCount > 0 || c.unread))) {
    setState({ chats: sharedChats.map((c) => (c.id === chatId ? { ...c, unreadCount: 0, unread: undefined } : c)) });
  }

  let replyingTo = null;
  let editingMessage = null;
  let draftText = chat.draft ?? getState().chats.find((c) => c.id === chatId)?.draft ?? "";
  let infoOpen = false;
  let pinIndex = 0;
  let typingUserId = null;
  let typingAction = null;
  let iBlockedThem = !!chat.otherUser && !!me.blockedUserIds?.includes(chat.otherUser.id);
  let messagesCount = messages.length;
  let isShalterAdmin = false;
  let gifts = [];

  const isDm = chat.type === "dm";
  const isSaved = !!chat.isSaved || (isDm && chat.memberIds?.length === 1 && chat.memberIds[0] === me.id);
  let other = chat.otherUser ?? (isDm ? members.find((u) => u.id !== me.id) : null) ?? null;

  Promise.all([api.getPremiumInfo(), isDm && other ? api.listGifts() : Promise.resolve({ gifts: [] })])
    .then(([info, giftsRes]) => {
      isShalterAdmin = info.isAdmin;
      gifts = giftsRes.gifts;
      if (isShalterAdmin) renderInfoPanel();
    })
    .catch(() => {});
  const isChannel = chat.type === "channel";
  const isChannelAdmin = isChannel && isChatAdmin(chat, me.id);
  const isGroup = chat.type === "group";
  const canPin = isDm || isChatAdmin(chat, me.id) || isChatModerator(chat, me.id);
  const canViewReactionDetails = !isChannel || isChatAdmin(chat, me.id) || isChatModerator(chat, me.id);

  async function jumpTo(id) {
    for (let page = 0; page < 20; page++) {
      const node = document.getElementById(`msg-${id}`);
      if (node) {
        stuckToBottom = false;
        noStickUntil = Date.now() + 1500;
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        node.classList.add("message-row-flash");
        setTimeout(() => node.classList.remove("message-row-flash"), 1200);
        return;
      }
      if (!hasMoreHistory) return;
      await loadOlder();
    }
  }

  let msgSeq = 0;
  let msgInFlight = false;
  let msgPending = false;
  let msgTimer = null;

  function scheduleRefresh(delay = 200) {
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => refreshMessages(), delay);
  }

  async function refreshMessages() {
    if (msgInFlight) {
      msgPending = true;
      return;
    }
    msgInFlight = true;
    const seq = ++msgSeq;
    try {
      await doRefreshMessages(seq);
    } catch {
    } finally {
      msgInFlight = false;
      if (msgPending) {
        msgPending = false;
        scheduleRefresh(0);
      }
    }
  }

  async function doRefreshMessages(seq) {
    const filterAtStart = topicFilter;
    const res = await api.listMessages(chat.id, { limit: PAGE_SIZE, ...topicQuery() });
    if (seq !== msgSeq || filterAtStart !== topicFilter) return;
    rememberReplyTargets(res);
    const fresh = res.messages;
    if (!fresh.length) {
      messages = [];
      messagesCount = 0;
      saveChatCache();
      renderList();
      return;
    }
    const cutoff = fresh[0].createdAt;
    const older = messages.filter((m) => m.createdAt < cutoff && !m.pending);
    const stillPending = messages.filter((m) => m.pending);
    const merged = [...older, ...fresh, ...stillPending];
    const grew = merged.length > messagesCount;
    if (!grew && sameMessages(messages, merged)) return;
    messages = merged;
    messagesCount = messages.length;
    saveChatCache();
    if (!older.length) hasMoreHistory = !!res.hasMore;
    let landOnUnread = false;
    if (awaitingUnreadMark) {
      awaitingUnreadMark = false;
      if (res.firstUnreadId && fresh.some((m) => m.id === res.firstUnreadId)) {
        firstUnreadId = res.firstUnreadId;
        landOnUnread = atBottom();
      }
    }
    const wasAtBottom = atBottom();
    const prevTop = list.scrollTop;
    renderList();
    if (landOnUnread && scrollToUnreadDivider()) {
    } else if (grew && wasAtBottom) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    } else {
      list.scrollTop = prevTop;
      if (grew) missedWhileUp += 1;
    }
    updateScrollDown();
  }

  function sameMessages(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (
        x.id !== y.id ||
        x.text !== y.text ||
        x.editedAt !== y.editedAt ||
        x.pinned !== y.pinned ||
        x.views !== y.views ||
        x.commentCount !== y.commentCount ||
        x.boostedUntil !== y.boostedUntil ||
        x.readByIds?.length !== y.readByIds?.length ||
        contentKey(x) !== contentKey(y)
      ) {
        return false;
      }
    }
    return true;
  }
  function contentKey(m) {
    return JSON.stringify([m.reactions ?? null, m.attachments ?? null, m.linkPreview ?? null]);
  }

  async function loadOlder() {
    if (loadingHistory || !hasMoreHistory || !messages.length) return;
    loadingHistory = true;
    const anchorHeight = list.scrollHeight;
    const anchorTop = list.scrollTop;
    try {
      const res = await api.listMessages(chat.id, { limit: PAGE_SIZE, before: messages[0].createdAt, beforeId: messages[0].id, ...topicQuery() });
      rememberReplyTargets(res);
      if (res.messages.length) {
        messages = [...res.messages, ...messages];
        messagesCount = messages.length;
        renderList();
        list.scrollTop = anchorTop + (list.scrollHeight - anchorHeight);
        stuckToBottom = atBottom();
      }
      hasMoreHistory = !!res.hasMore;
    } catch {
    } finally {
      loadingHistory = false;
    }
  }

  let pendingSeq = 0;
  const localThumbs = new Map();
  const withLocalThumbs = (m) =>
    m.attachments?.some((a) => a.previewPending && !a.thumbUrl && localThumbs.has(a.url))
      ? {
          ...m,
          attachments: m.attachments.map((a) =>
            a.previewPending && !a.thumbUrl && localThumbs.has(a.url) ? { ...a, thumbUrl: localThumbs.get(a.url) } : a
          ),
        }
      : m;

  // Как в Telegram: текст длиннее 4096 символов уходит несколькими
  // сообщениями, вложения и прочее — с первым.
  const MAX_TEXT = 4096;
  function splitLongText(text) {
    const parts = [];
    let rest = text;
    while (rest.length > MAX_TEXT) {
      const slice = rest.slice(0, MAX_TEXT);
      let cut = slice.lastIndexOf("\n");
      if (cut < MAX_TEXT / 2) cut = slice.lastIndexOf(" ");
      if (cut < MAX_TEXT / 2) cut = MAX_TEXT;
      parts.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^[\s]+/, "");
    }
    if (rest) parts.push(rest);
    return parts;
  }

  async function handleSend(text, attachments, extraIn) {
    if (typeof text !== "string" || text.length <= MAX_TEXT || extraIn?.sticker) return sendOne(text, attachments, extraIn);
    const [first, ...others] = splitLongText(text);
    const sent = await sendOne(first, attachments, extraIn);
    if (!sent) return sent;
    const { silent } = extraIn ?? {};
    for (const part of others) {
      if (!(await sendOne(part, [], silent ? { silent } : undefined))) break;
    }
    return sent;
  }

  async function sendOne(text, attachments, extraIn) {
    const { uploading, ...extra } = extraIn ?? {};
    const replyToId = replyingTo?.id ?? null;
    const topicId = currentTopicId() ?? replyingTo?.topicId ?? null;
    if (topicId) extra.topicId = topicId;
    replyingTo = null;

    const localId = `local_${++pendingSeq}_${Date.now()}`;
    const optimistic = {
      id: localId,
      chatId: chat.id,
      senderId: me.id,
      type: extra?.sticker ? "sticker" : "text",
      text,
      attachments: attachments ?? [],
      replyToId,
      createdAt: new Date().toISOString(),
      reactions: [],
      readByIds: [],
      pending: true,
      ...(extra ?? {}),
    };
    messages = [...messages, optimistic];
    messagesCount = messages.length;
    draftText = "";
    renderList();
    renderComposer();
    list.scrollTop = list.scrollHeight;

    const dropOptimistic = () => {
      messages = messages.filter((m) => m.id !== localId);
      messagesCount = messages.length;
    };

    let sentMessage = null;
    try {
      if (uploading) {
        const localAtts = attachments ?? [];
        attachments = await uploading;
        attachments.forEach((a, i) => {
          if (localAtts[i]?.url?.startsWith("blob:")) localThumbs.set(a.url, localAtts[i].url);
        });
      }
      const { message } = isChannel
        ? await api.publishPost(chat.id, text, attachments)
        : await api.sendMessage(chat.id, text, { replyToId, attachments, ...extra });
      sentMessage = message;
      if (getState().settings?.notifications?.sound !== false) playSentSound();
      noteMessageInChatList(chat.id, message);
      const at = messages.findIndex((m) => m.id === localId);
      if (at >= 0) messages[at] = message;
      else messages = [...messages, message];
      rerenderListKeepingScroll();
    } catch (err) {
      dropOptimistic();
      rerenderListKeepingScroll();
      alert(err.message || "Не удалось отправить сообщение");
      if (text) draftText = text;
    }
    renderComposer();
    await refreshMessages();
    return sentMessage;
  }

  function handleDraftChange(text) {
    draftText = text;
    const { chats: sharedChats } = getState();
    if (sharedChats.some((c) => c.id === chat.id)) {
      setState({ chats: sharedChats.map((c) => (c.id === chat.id ? { ...c, draft: text } : c)) });
    }
  }

  async function handleForward(message, targetChatId, { hideAuthor = false } = {}) {
    const sender = senderOf(message.senderId);
    const title = isDm ? (other?.name ?? chat.title) : chat.title;
    await api.sendMessage(targetChatId, message.text, {
      attachments: (message.attachments ?? []).map((a) =>
        a.kind === "poll" ? { ...a, meta: { ...a.meta, voterIds: [], votes: [] } } : a
      ),
      ...(message.sticker ? { sticker: message.sticker } : {}),
      ...(message.customEmoji ? { customEmoji: message.customEmoji } : {}),
      forwardedFrom: { messageId: message.id, hideAuthor, chatId: chat.id, chatTitle: title, senderId: message.senderId, senderName: sender?.name ?? "Аноним" },
    });
  }

  // Все действия ниже — оптимистичные, как в Telegram: интерфейс меняется
  // сразу, запрос идёт в фоне, при ошибке изменение откатывается.
  function undoWith(snapshot, err, fallback) {
    messages = snapshot;
    messagesCount = messages.length;
    rerenderListKeepingScroll();
    alert(err?.message || fallback);
  }

  async function handleSaveEdit(text) {
    if (!editingMessage) return;
    const id = editingMessage.id;
    editingMessage = null;
    const snapshot = messages.slice();
    messages = messages.map((m) => (m.id === id ? { ...m, text, editedAt: new Date().toISOString() } : m));
    rerenderListKeepingScroll();
    renderComposer();
    try {
      await api.editMessage(chat.id, id, text);
    } catch (err) {
      undoWith(snapshot, err, "Не удалось изменить сообщение");
      return;
    }
    scheduleRefresh();
  }

  async function handleDelete(m, forEveryone) {
    if (m.pending) return;
    messages = messages.filter((x) => x.id !== m.id);
    messagesCount = messages.length;
    rerenderListKeepingScroll();
    saveChatCache();
    try {
      await api.deleteMessage(chat.id, m.id, forEveryone);
    } catch (err) {
      alert(err.message || "Не удалось удалить сообщение");
    }
    scheduleRefresh();
  }

  // Запрет пересылки и сохранения (включил кто-то из двоих в личке).
  function isProtected() {
    return (isDm && (chat.protectedBy ?? []).length > 0) || !!chat.secret;
  }
  function applyProtection() {
    document.body.classList.toggle("protected-chat-open", isProtected());
    list.classList.toggle("protected-content", isProtected());
  }

  function currentTopicId() {
    return chat.topicsEnabled && topicFilter && topicFilter !== "general" ? topicFilter : null;
  }
  function currentTopic() {
    const id = currentTopicId();
    return id ? topics.find((t) => t.id === id) ?? null : null;
  }

  const topicsSlot = el("div", { class: "topic-tabs-slot" });
  function renderTopicTabs() {
    clear(topicsSlot);
    if (!isGroup || !chat.topicsEnabled) return;
    const admin = isChatAdmin(chat, me.id);
    const staff = admin || isChatModerator(chat, me.id);
    const perms = chat.permissions ?? {};
    topicsSlot.appendChild(
      TopicTabs({
        chatId: chat.id,
        topics,
        active: topicFilter,
        canCreate: staff || perms.createTopics !== false,
        isAdmin: staff,
        meId: me.id,
        onSelect: selectTopic,
        onChanged: loadTopics,
      })
    );
  }

  async function loadTopics() {
    if (!isGroup || !chat.topicsEnabled) {
      topics = [];
      renderTopicTabs();
      return;
    }
    try {
      const res = await api.listTopics(chat.id);
      topics = res.topics ?? [];
    } catch {
      topics = [];
    }
    if (topicFilter && topicFilter !== "general" && !topics.some((t) => t.id === topicFilter)) {
      selectTopic(undefined);
      return;
    }
    renderTopicTabs();
    renderComposer();
  }

  function selectTopic(id) {
    if (topicFilter === id) return;
    topicFilter = id;
    messages = [];
    messagesCount = 0;
    hasMoreHistory = false;
    firstUnreadId = null;
    replyingTo = null;
    renderTopicTabs();
    renderList();
    renderComposer();
    msgSeq++;
    scheduleRefresh(0);
  }

  function saveChatCache() {
    if (topicFilter) return;
    writeCache(`chat.${chatId}`, me.id, { chat, members, messages: messages.filter((x) => !x.pending).slice(-PAGE_SIZE) });
  }

  async function handleReact(m, emoji) {
    const before = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
    const existing = m.reactions.find((r) => r.emoji === emoji);
    const amAdding = !existing || !existing.userIds.includes(me.id);
    if (existing) {
      existing.userIds = existing.userIds.includes(me.id)
        ? existing.userIds.filter((u) => u !== me.id)
        : [...existing.userIds, me.id];
      m.reactions = m.reactions.filter((r) => r.userIds.length > 0);
    } else {
      m.reactions.push({ emoji, userIds: [me.id] });
    }
    rerenderListKeepingScroll();
    if (amAdding) {
      const pill = document.querySelector(
        `.reaction-pill[data-msgid="${CSS.escape(m.id)}"][data-emoji="${CSS.escape(emoji)}"]`
      );
      pill?.classList.add("just-added");
    }
    try {
      const { message } = await api.react(chat.id, m.id, emoji);
      // Сервер мог отказать (лимит реакций) — показываем его версию.
      if (message?.reactions && JSON.stringify(message.reactions) !== JSON.stringify(m.reactions)) replaceMessage(message);
    } catch (err) {
      m.reactions = before;
      rerenderListKeepingScroll();
      alert(err.message || "Не удалось поставить реакцию");
    }
  }

  function replaceMessage(updated) {
    if (!updated) return;
    const idx = messages.findIndex((x) => x.id === updated.id);
    if (idx >= 0) messages[idx] = updated;
    rerenderListKeepingScroll();
  }
  function applyLocalVote(m, optionIndex) {
    const a = m.attachments?.find((x) => x.kind === "poll");
    if (!a || a.meta?.closed) return;
    const multiple = !!a.meta.multiple && !Number.isInteger(a.meta.correctIndex);
    const voterIds = (a.meta.voterIds ?? a.meta.options.map(() => [])).map((ids) => [...(ids ?? [])]);
    if (optionIndex === null) {
      for (let i = 0; i < voterIds.length; i++) voterIds[i] = voterIds[i].filter((v) => v !== me.id);
    } else if (multiple) {
      voterIds[optionIndex] = voterIds[optionIndex].includes(me.id) ? voterIds[optionIndex].filter((v) => v !== me.id) : [...voterIds[optionIndex], me.id];
    } else {
      for (let i = 0; i < voterIds.length; i++) voterIds[i] = voterIds[i].filter((v) => v !== me.id);
      voterIds[optionIndex].push(me.id);
    }
    a.meta = { ...a.meta, voterIds, votes: voterIds.map((v) => v.length) };
    rerenderListKeepingScroll();
  }

  async function handleVote(m, optionIndex) {
    applyLocalVote(m, optionIndex);
    try {
      const { message } = await api.votePoll(chat.id, m.id, optionIndex);
      replaceMessage(message);
    } catch {
      await refreshMessages();
    }
  }

  async function handlePollAction(m, action) {
    try {
      if (action === "retract") {
        applyLocalVote(m, null);
        const { message } = await api.retractPollVote(chat.id, m.id);
        replaceMessage(message);
      } else if (action === "close") {
        const a = m.attachments?.find((x) => x.kind === "poll");
        if (a) {
          a.meta = { ...a.meta, closed: true };
          rerenderListKeepingScroll();
        }
        const { message } = await api.closePoll(chat.id, m.id);
        replaceMessage(message);
      }
    } catch (err) {
      alert(err.message || "Не получилось");
      await refreshMessages();
    }
  }

  async function handlePin(m) {
    const snapshot = messages.slice();
    const pinned = !m.pinned;
    messages = messages.map((x) => (x.id === m.id ? { ...x, pinned } : x));
    rerenderListKeepingScroll();
    try {
      await api.pinMessage(chat.id, m.id, pinned);
    } catch (err) {
      undoWith(snapshot, err, "Не удалось закрепить сообщение");
      return;
    }
    scheduleRefresh();
  }

  async function setMute(opts) {
    const before = chat;
    const beforeList = getState().chats;
    // Точное «до какого времени» пришлёт сервер; пока — просто «выключено».
    const muted = !opts?.off;
    chat = { ...chat, muted, mutedUntil: muted ? chat.mutedUntil : undefined };
    setState({ chats: (beforeList ?? []).map((c) => (c.id === chat.id ? { ...c, muted, mutedUntil: chat.mutedUntil } : c)) });
    renderHeader();
    renderInfoPanel();
    try {
      const { chat: updated } = await api.muteChat(chat.id, opts);
      chat = { ...chat, ...updated };
      renderHeader();
      renderInfoPanel();
      api.listChats().then((r) => setState({ chats: r.chats }), () => {});
    } catch (err) {
      chat = before;
      setState({ chats: beforeList });
      renderHeader();
      renderInfoPanel();
      alert(err.message || "Не удалось изменить уведомления");
    }
  }

  function toggleMute() {
    if (isChatMuted(chat)) setMute({ off: true });
    else openMuteDurationDialog(setMute);
  }

  async function toggleBlock() {
    if (!other) return;
    iBlockedThem = !iBlockedThem;
    renderComposer();
    renderInfoPanel();
    try {
      await api.setBlocked(other.id, iBlockedThem);
    } catch (err) {
      iBlockedThem = !iBlockedThem;
      renderComposer();
      renderInfoPanel();
      alert(err.message || "Не удалось изменить блокировку");
    }
  }

  async function handleMemberAction(userId, role) {
    try {
      await api.setMemberRole(chat.id, userId, role);
    } catch (err) {
      alert(err.message || "Не удалось изменить права");
      return;
    }
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
      current: settings?.chatWallpapers?.[chat.id] ?? chat.wallpaper ?? null,
      onSelect: async (wallpaper, forEveryone, label) => {
        if (forEveryone) {
          const { chat: updated } = await api.setChatWallpaper(chat.id, wallpaper, true, label);
          chat = { ...chat, wallpaper: updated.wallpaper };
        } else {
          const { settings: updated } = await api.setChatWallpaper(chat.id, wallpaper, false);
          setState({ settings: updated });
        }
        applyWallpaper(list, chat);
      },
    });
  }

  function handleLeaveOrDelete() {
    const isGroupLike = chat.type === "group" || chat.type === "channel";
    const dropFromList = () => setState({ chats: (getState().chats ?? []).filter((c) => c.id !== chat.id) });
    openDeleteChatDialog(chat, me.id, {
      moderator: isGroupLike && !isChatAdmin(chat, me.id) && isServerModerator(),
      onDelete: async (forEveryone) => {
        try {
          if (forEveryone) await api.deleteChat(chat.id);
          else await api.deleteChatForMe(chat.id);
          dropFromList();
          navigate("/");
        } catch (err) {
          alert(err.message || "Не удалось удалить");
        }
      },
      onLeave: isGroupLike
        ? async () => {
            try {
              await api.leaveChat(chat.id);
              dropFromList();
              navigate("/");
            } catch (err) {
              alert(err.message || "Не удалось выйти из чата");
            }
          }
        : null,
    });
  }

  async function placeCall(kind) {
    try {
      await placeCallController(chat.id, kind, me, { ringAll: chat.type === "group" });
    } catch (err) {
      alert(err.message || "Не удалось позвонить");
    }
  }

  const chatTitle = () => (isSaved ? "Избранное" : isDm ? (other?.name ?? chat.title) : chat.title);

  const selected = new Set();
  let selecting = false;

  function toggleSelect(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    if (!selected.size) selecting = false;
    rerenderListKeepingScroll();
    renderSelectionBar();
  }

  function startSelecting(id) {
    selecting = true;
    selected.clear();
    if (id) selected.add(id);
    rerenderListKeepingScroll();
    renderSelectionBar();
  }

  function clearSelection() {
    selecting = false;
    selected.clear();
    rerenderListKeepingScroll();
    renderSelectionBar();
  }

  function selectedMessages() {
    return messages.filter((m) => selected.has(m.id));
  }

  const selectionBar = el("div", { class: "selection-bar-slot" });
  const searchBar = el("div", { class: "chat-search-slot" });

  function openSearch(initial = "") {
    clear(searchBar);
    searchQuery = initial;
    const input = el("input", {
      class: "login-input chat-search-field",
      type: "search",
      placeholder: "Найти в этом чате",
      value: initial,
      oninput: (e) => {
        searchQuery = e.target.value;
        clearTimeout(searchBar._timer);
        searchBar._timer = setTimeout(runSearch, 250);
      },
    });
    const results = el("div", { class: "chat-search-results" });
    searchBar.appendChild(
      el("div", { class: "chat-search-panel" }, [
        input,
        el("button", { class: "icon-btn", title: "Закрыть поиск", html: iconSvg("X", 16), onclick: closeSearch }),
        results,
      ])
    );
    input.focus();
    if (initial) runSearch();

    async function runSearch() {
      const q = searchQuery.trim();
      clear(results);
      if (q.length < 2) return;
      try {
        const res = await api.searchInChat(chat.id, q);
        searchResults = res.messages;
      } catch {
        searchResults = [];
      }
      clear(results);
      if (!searchResults.length) {
        results.appendChild(el("p", { class: "empty-hint" }, "Ничего не найдено"));
        return;
      }
      results.append(
        ...searchResults.map((m) =>
          el(
            "button",
            {
              class: "chat-search-hit",
              onclick: () => {
                closeSearch();
                jumpTo(m.id);
              },
            },
            [
              el("span", { class: "chat-search-hit-who" }, senderOf(m.senderId)?.name ?? ""),
              el("span", { class: "chat-search-hit-text" }, m.text),
            ]
          )
        )
      );
    }
  }

  function closeSearch() {
    searchQuery = "";
    searchResults = null;
    clear(searchBar);
  }

  function renderSelectionBar() {
    clear(selectionBar);
    if (!selecting) return;
    const picked = selectedMessages();
    const canDeleteForAll =
      picked.every((m) => m.senderId === me.id) || (!isDm && (isChatAdmin(chat, me.id) || isChatModerator(chat, me.id))) || isServerModerator();
    selectionBar.appendChild(
      el("div", { class: "selection-bar" }, [
        el("button", { class: "icon-btn", title: "Отменить", html: iconSvg("X", 18), onclick: clearSelection }),
        el("span", { class: "selection-count" }, `Выбрано: ${picked.length}`),
        el("button", {
          class: "icon-btn",
          title: "Копировать",
          html: iconSvg("Copy", 17),
          onclick: async () => {
            const text = picked
              .map((m) => `${senderOf(m.senderId)?.name ?? ""}: ${messagePreview(m)}`.trim())
              .join("\n");
            try {
              await navigator.clipboard.writeText(text);
            } catch {
            }
            clearSelection();
          },
        }),
        el("button", {
          class: "icon-btn",
          title: "Переслать",
          html: iconSvg("Forward", 17),
          onclick: () => {
            openForwardDialog(
              async (targetChatId, opts) => {
                clearSelection();
                for (const m of picked) await handleForward(m, targetChatId, opts);
              },
              { count: picked.length, allowHideAuthor: true }
            );
          },
        }),
        el("button", {
          class: "icon-btn danger",
          title: "Удалить",
          html: iconSvg("Trash", 17),
          onclick: () => {
            openChoiceDialog(
              `Удалить сообщений: ${picked.length}`,
              [
                { label: "Удалить только у себя", onClick: () => deleteMany(picked, false) },
                ...(canDeleteForAll ? [{ label: "Удалить у всех", danger: true, onClick: () => deleteMany(picked, true) }] : []),
              ]
            );
          },
        }),
      ])
    );
  }

  async function deleteMany(list, forEveryone) {
    for (const m of list) {
      try {
        await api.deleteMessage(chat.id, m.id, forEveryone);
      } catch {
      }
    }
    clearSelection();
    await refreshMessages();
  }

  const header = el("header", { class: "chat-header" });
  const pinnedBar = el("div", { class: "pinned-bar-slot" });
  const list = el("div", { class: "message-list" });
  const floatingDate = el("div", { class: "chat-floating-date" }, el("span", {}, ""));
  applyWallpaper(list, chat);
  const composerSlot = el("div", { class: "composer-slot" });
  const bodyBottomSlot = el("div", { class: "body-bottom-slot" });
  const liveBar = el("div", { class: "live-bar-slot" });
  let missedWhileUp = 0;
  const scrollDownBtn = el("button", {
    class: "chat-scroll-down",
    title: "К последним сообщениям",
    html: iconSvg("ChevronLeft", 20),
    onclick: () => {
      missedWhileUp = 0;
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      updateScrollDown();
    },
  });
  const scrollDownBadge = el("span", { class: "chat-scroll-down-badge" });
  scrollDownBtn.appendChild(scrollDownBadge);

  const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  function updateScrollDown() {
    const show = !atBottom();
    scrollDownBtn.classList.toggle("shown", show);
    if (!show) missedWhileUp = 0;
    scrollDownBadge.textContent = missedWhileUp > 0 ? String(missedWhileUp) : "";
    scrollDownBadge.classList.toggle("shown", missedWhileUp > 0);
  }

  const chatAdSlot = el("div", { class: "chat-ad-slot" });
  // Как в Telegram: в личке с человеком не из контактов — «Добавить в контакты»
  // и «Заблокировать». Закрыть можно крестиком (запоминается для этого чата).
  const contactBarSlot = el("div", { class: "contact-bar-slot" });
  const contactBarKey = `shalter_contact_bar_hidden_${chat.id}`;
  function renderContactBar() {
    clear(contactBarSlot);
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(contactBarKey) === "1";
    } catch {
    }
    if (!isDm || isSaved || !other || other.isBot || other.isServiceBot || other.inContacts || dismissed) return;
    contactBarSlot.appendChild(
      el("div", { class: "contact-bar" }, [
        el("button", {
          class: "contact-bar-btn",
          onclick: async () => {
            const name = prompt("Как записать в контактах?", other.name)?.trim();
            if (name === undefined) return;
            try {
              const sharePhone = confirm(`Поделиться своим номером телефона с ${other.name}?`);
              await api.addContact(other.id, name || null, { sharePhone });
              other = { ...other, inContacts: true, ...(name && name !== other.name ? { profileName: other.profileName ?? other.name, name } : {}) };
              renderContactBar();
              renderHeader();
            } catch (err) {
              alert(err.message || "Не удалось добавить в контакты");
            }
          },
        }, "Добавить в контакты"),
        el("button", {
          class: "contact-bar-btn danger",
          onclick: async () => {
            if (iBlockedThem) return toggleBlock();
            if (!confirm(`Заблокировать ${other.name}? Он(а) не сможет писать и звонить вам.`)) return;
            await toggleBlock();
            renderContactBar();
          },
        }, iBlockedThem ? "Разблокировать" : "Заблокировать"),
        el("button", {
          class: "icon-btn contact-bar-close",
          title: "Скрыть",
          html: iconSvg("X", 15),
          onclick: () => {
            try {
              localStorage.setItem(contactBarKey, "1");
            } catch {
            }
            renderContactBar();
          },
        }),
      ])
    );
  }
  renderContactBar();
  const audioBar = AudioPlayerBar({ chatId });
  const mainCol = el("div", { class: "chat-main-col" }, [header, audioBar, topicsSlot, selectionBar, searchBar, liveBar, pinnedBar, contactBarSlot, chatAdSlot, floatingDate, list, scrollDownBtn, bodyBottomSlot, composerSlot]);
  api
    .serveAd("chat")
    .then((r) => {
      if (!r.ad) return;
      clear(chatAdSlot);
      chatAdSlot.appendChild(
        el("button", { class: "chat-ad-banner", title: r.ad.url || "", onclick: () => openAd(r.ad) }, [
          el("span", { class: "chat-ad-mark", html: iconSvg("Zap", 16) }),
          el("span", { class: "chat-ad-body" }, [
            el("span", { class: "chat-ad-title" }, r.ad.title || "Реклама"),
            r.ad.text ? el("span", { class: "chat-ad-text" }, r.ad.text) : null,
          ]),
          el("span", { class: "sponsored-badge" }, "РЕКЛАМА"),
        ])
      );
    })
    .catch(() => {});
  const infoSlot = el("div", { class: "info-panel-slot" });
  const wrap = el("div", { class: "chat-view" }, [mainCol, infoSlot]);

  let liveInfo = null;
  async function loadLive() {
    if (chat.type === "dm") return;
    try {
      liveInfo = await api.getLiveForChat(chat.id);
    } catch {
      liveInfo = null;
    }
    renderHeader();
    renderLiveBar();
  }
  let voiceRoom = null;
  async function loadVoiceRoom() {
    if (chat.type !== "group") return;
    try {
      ({ call: voiceRoom } = await api.getVoiceRoom(chat.id));
    } catch {
      voiceRoom = null;
    }
    renderHeader();
  }
  async function startLive(source) {
    try {
      const { stream } = await api.startLive(chat.id, { title: chat.title, withVideo: true, source });
      await loadLive();
      openLiveScreen(stream.id, { chatTitle: chat.title, canStopStream: !!liveInfo?.canStop });
    } catch (err) {
      alert(err.message || "Не удалось начать эфир");
    }
  }

  function askLiveSource() {
    openChoiceDialog("Начать эфир", [
      { label: "Из браузера — камера и экран", onClick: () => startLive("webrtc") },
      { label: "Через OBS Studio или другую программу", onClick: () => startLive("rtmp") },
    ]);
  }

  let botAudience = null;
  let botApp = null;
  function pluralUsers(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "пользователь";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "пользователя";
    return "пользователей";
  }
  function loadBotAudience() {
    const peer = chat.type === "dm" ? chat.otherUser : null;
    if (!peer?.isBot) return;
    api
      .getBotAudience(peer.id)
      .then((res) => {
        botAudience = res.users;
        botApp = res.app ?? null;
        renderHeader();
      })
      .catch(() => {});
  }

  async function stopLiveFromBar(stream) {
    if (!confirm("Завершить эфир для всех?")) return;
    try {
      await api.stopLive(stream.id);
    } catch (err) {
      alert(err.message || "Не удалось завершить эфир");
    }
    await loadLive();
  }

  function renderLiveBar() {
    clear(liveBar);
    const stream = liveInfo?.stream;
    if (!stream) return;
    liveBar.appendChild(
      el("div", { class: "live-bar" }, [
        el("span", { class: "live-bar-dot" }),
        el("div", { class: "live-bar-body" }, [
          el("p", { class: "live-bar-title" }, stream.title || "Идёт эфир"),
          el("p", { class: "live-bar-sub" }, `${liveInfo.viewers ?? 0} в эфире`),
        ]),
        el(
          "button",
          {
            class: "live-bar-join",
            onclick: () => openLiveScreen(stream.id, { chatTitle: chat.title, canStopStream: !!liveInfo.canStop }),
          },
          "Смотреть"
        ),
        liveInfo.canStop
          ? el("button", { class: "live-bar-stop", onclick: () => stopLiveFromBar(stream) }, "Завершить")
          : null,
      ])
    );
  }

  function renderHeader() {
    clear(header);
    const subtitle = (() => {
      if (typingUserId) {
        const label = CHAT_ACTION_LABELS[typingAction] ?? CHAT_ACTION_LABELS.typing;
        if (isDm) return `${label}…`;
        const typist = members.find((m) => m.id === typingUserId);
        if (typist) return `${typist.name} ${label}…`;
      }
      if (isSaved) return "";
      if (chat.type === "bot") return "бот";
      if (isDm && other?.isBot) {
        return botAudience == null ? "бот" : `${botAudience} ${pluralUsers(botAudience)}`;
      }
      if (isDm && other) return lastSeenLabel(other);
      if (chat.type === "group") {
        const base = `${members.length} ${plural(members.length, "участник", "участника", "участников")}`;
        const onlineCount = members.filter((m) => m.id !== me.id && m.online).length;
        return onlineCount > 0 ? `${base}, ${onlineCount} в сети` : base;
      }
      if (chat.type === "channel") return `${members.length} ${plural(members.length, "подписчик", "подписчика", "подписчиков")}`;
      return "";
    })();

    appendAll(
      header,
      ...[
        el("button", { class: "chat-header-back", html: iconSvg("ChevronLeft", 20), onclick: () => navigate("/") }),
        el(
          "button",
          { class: "chat-header-info-btn", onclick: () => setInfoOpen(true) },
          [
            isSaved
              ? el("span", { class: "saved-avatar chat-header-saved-avatar", html: iconSvg("Bookmark", 20) })
              : Avatar({
              name: other?.name ?? chatTitle(),
              color: other?.avatarColor ?? chat.avatarColor,
              image: other ? other.avatarImage : chat.avatarImage,
              size: 38,
              online: isDm ? other?.online : undefined,
              isPremium: isDm && other?.isPremium,
              isDeveloper: isDm && other?.isDeveloper,
              orbit: true,
            }),
            el("div", { class: "chat-header-titles" }, [
              el("p", { class: `chat-header-title${chat.secret ? " secret-chat-title" : ""}` }, [
                chat.secret ? el("span", { class: "secret-chat-lock", title: "Секретный чат", html: iconSvg("Lock", 14) }) : null,
                el("span", { class: "chat-header-title-text" }, chatTitle()),
                ...(isSaved ? [] : [
                VerifiedBadge(isDm ? other : chat, 15),
                isDm && other?.isDeveloper
                  ? el("span", { class: "developer-mini-badge", title: "Разработчик Shalter", html: iconSvg("Code", 15) })
                  : null,
                isDm && other?.isPremium ? PremiumStar({ size: 16, seed: other.id, title: "Shalter Premium" }) : null,
                isDm ? ProfileStatusBadge(other, 15) : null,
                isDm && safetyLabelInfo(other?.safetyLabel)
                  ? el(
                      "span",
                      { class: `safety-badge safety-mini safety-${other.safetyLabel}`, title: safetyLabelInfo(other.safetyLabel).hint },
                      safetyLabelInfo(other.safetyLabel).short
                    )
                  : null,
                ]),
              ]),
              el("p", { class: `chat-header-subtitle${typingUserId ? " is-typing" : isDm && other?.online ? " is-online" : ""}` }, subtitle),
            ]),
          ]
        ),
        isDm && other?.isBot && botApp
          ? el(
              "button",
              {
                class: "icon-btn chat-header-app-btn",
                title: botApp.name,
                onclick: () => openMiniApp({ botId: other.id, botName: other.name, chatId: chat.id, appName: botApp.name }),
              },
              [el("span", { class: "chat-header-app-icon", html: iconSvg("Code", 15) }), el("span", { class: "chat-header-app-label" }, botApp.name)]
            )
          : null,
        !isDm && liveInfo?.canHost && !liveInfo?.stream
          ? el("button", { class: "icon-btn chat-header-live-btn", title: "Начать эфир", onclick: askLiveSource }, [
              el("span", { class: "chat-header-live-dot" }),
              el("span", { class: "chat-header-live-label" }, "Эфир"),
            ])
          : null,
        chat.type === "group" && voiceRoom
          ? el("button", { class: "icon-btn chat-header-live-btn", title: "Присоединиться к голосовому чату", onclick: () => joinVoiceRoom(chat.id, me) }, [
              el("span", { class: "chat-header-live-dot" }),
              el("span", { class: "chat-header-live-label" }, `Голосовой чат · ${voiceRoom.participantIds.length}`),
            ])
          : null,
        (isDm && !isSaved) || chat.type === "group"
          ? el("button", {
              class: "icon-btn",
              title: isDm ? "Позвонить" : "Позвонить всем в группе",
              html: iconSvg("Phone", 18),
              onclick: () => placeCall("audio"),
            })
          : null,
        (isDm && !isSaved) || chat.type === "group"
          ? el("button", {
              class: "icon-btn",
              title: isDm ? "Видеозвонок" : "Видеозвонок всем в группе",
              html: iconSvg("Video", 18),
              onclick: () => placeCall("video"),
            })
          : null,
        el("button", {
          class: "icon-btn",
          title: "Ещё",
          html: iconSvg("More", 18),
          onclick: (e) =>
            openDropdownMenu({ x: e.clientX, y: e.clientY }, [
              { icon: "Search", label: "Поиск по чату", onClick: () => openSearch() },
              ...(chat.type === "group" && !voiceRoom
                ? [{ icon: "Phone", label: "Начать голосовой чат", onClick: () => joinVoiceRoom(chat.id, me) }]
                : []),
              ...(isGroup && isChatAdmin(chat, me.id)
                ? [
                    {
                      icon: "Folder",
                      label: chat.topicsEnabled ? "Выключить темы" : "Включить темы",
                      onClick: async () => {
                        const enabled = !chat.topicsEnabled;
                        if (!enabled && !confirm("Выключить темы? Сообщения останутся, но будут показаны одной лентой.")) return;
                        try {
                          const res = await api.setTopicsEnabled(chat.id, enabled);
                          chat = { ...chat, topicsEnabled: res.chat?.topicsEnabled };
                          topics = res.topics ?? [];
                          if (!enabled) topicFilter = undefined;
                          renderTopicTabs();
                          renderComposer();
                          scheduleRefresh(0);
                        } catch (err) {
                          alert(err.message || "Не удалось изменить настройку");
                        }
                      },
                    },
                  ]
                : []),
              // Модерация Shalter: удалить группу, канал или бота за нарушение прямо из чата.
              ...((me.isDeveloper || me.adminSections?.includes("moderation")) &&
              ((isGroup || isChannel) && chat.ownerId !== me.id || (isDm && other?.isBot && !other.isServiceBot && !String(other.id).startsWith("bot_")))
                ? [
                    {
                      icon: "Trash",
                      danger: true,
                      label: "Удалить за нарушение",
                      onClick: async () => {
                        const what = isChannel ? "канал" : isGroup ? "группу" : "бота";
                        const reason = prompt(`Удалить ${what} «${chatTitle()}» за нарушение правил? Это необратимо.\n\nПричина — придёт владельцу и попадёт в журнал:`, "")?.trim();
                        if (!reason) return;
                        try {
                          if (isDm) await api.adminDeleteBot(other.id, reason);
                          else await api.deleteChat(chat.id, reason);
                          setState({ chats: getState().chats.filter((c) => c.id !== chat.id) });
                          navigate("/");
                        } catch (err) {
                          alert(err.message || "Не удалось удалить");
                        }
                      },
                    },
                  ]
                : []),
              {
                icon: isChatMuted(chat) ? "Bell" : "BellOff",
                label: isChatMuted(chat) ? "Включить уведомления" : "Отключить уведомления",
                onClick: isChatMuted(chat) ? () => setMute({ off: true }) : () => openMuteDurationDialog(setMute),
              },
              ...(isDm && !isSaved && !other?.isBot && !chat.secret
                ? [
                    {
                      icon: "Lock",
                      label: (chat.protectedBy ?? []).includes(me.id) ? "Разрешить пересылку" : "Запретить пересылку",
                      onClick: async () => {
                        const enabled = !(chat.protectedBy ?? []).includes(me.id);
                        try {
                          const res = await api.setChatProtected(chat.id, enabled);
                          chat = { ...chat, protectedBy: res.protectedBy ?? [] };
                          applyProtection();
                          renderList();
                        } catch (err) {
                          if (err.premiumHelps || /Premium/.test(err.message ?? "")) {
                            if (confirm(`${err.message}. Открыть Premium?`)) navigate("/settings/premium");
                          } else alert(err.message || "Не удалось изменить настройку");
                        }
                      },
                    },
                  ]
                : []),
              { icon: "Info", label: "Информация о чате", onClick: () => setInfoOpen(true) },
              { icon: "Image", label: "Фон чата", onClick: handleChooseWallpaper },
              { icon: "Clock", label: "Запланированные сообщения", onClick: () => openScheduledMessagesDialog(chat.id) },
              { icon: "Trash", label: "Очистить историю", onClick: handleClearHistory },
              {
                icon: "Archive",
                label: chat.archived ? "Вернуть из архива" : "Архивировать",
                onClick: async () => {
                  const archived = !chat.archived;
                  chat = { ...chat, archived };
                  setState({ chats: (getState().chats ?? []).map((c) => (c.id === chat.id ? { ...c, archived } : c)) });
                  try {
                    await api.patchChat(chat.id, { archived });
                  } catch (err) {
                    alert(err.message || "Не удалось изменить чат");
                  }
                },
              },
              {
                icon: "X",
                label: chat.type === "channel" ? "Канал: выйти или удалить" : chat.type === "group" ? "Группа: выйти или удалить" : "Удалить чат",
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
    const current = pinned[pinIndex % pinned.length];
    pinnedBar.appendChild(
      el("div", { class: "pinned-bar" }, [
        el(
          "button",
          {
            class: "pinned-bar-jump",
            title: "Перейти к закреплённому",
            onclick: () => {
              jumpTo(current.id);
              pinIndex++;
            },
          },
          [
            el("span", { html: iconSvg("Pin", 14) }),
            el("span", { class: "pinned-bar-text" }, messagePreview(current) || "Сообщение"),
            pinned.length > 1 ? el("span", { class: "mono pinned-bar-count" }, String(pinned.length)) : null,
          ].filter(Boolean)
        ),
        canPin
          ? el("button", {
              class: "icon-btn pinned-bar-unpin",
              title: "Открепить",
              html: iconSvg("X", 15),
              onclick: () => handlePin(current),
            })
          : null,
      ].filter(Boolean))
    );
  }

  let hideDateTimer = null;
  function updateFloatingDate() {
    const dividers = list.querySelectorAll(".date-divider");
    if (!dividers.length) {
      floatingDate.classList.remove("visible");
      return;
    }
    const top = list.getBoundingClientRect().top;
    let current = null;
    let nextNear = false;
    for (const d of dividers) {
      const off = d.getBoundingClientRect().top - top;
      if (off <= 8) current = d;
      else {
        nextNear = off < 44;
        break;
      }
    }
    if (!current || nextNear || current.getBoundingClientRect().bottom > top) {
      floatingDate.classList.remove("visible");
      return;
    }
    const text = current.textContent.trim();
    if (text && floatingDate.firstChild.textContent !== text) floatingDate.firstChild.textContent = text;
    floatingDate.style.top = `${list.offsetTop + 8}px`;
    floatingDate.classList.add("visible");
    clearTimeout(hideDateTimer);
    hideDateTimer = setTimeout(() => floatingDate.classList.remove("visible"), 1200);
  }

  let stuckToBottom = true;
  let noStickUntil = 0;
  list.addEventListener("scroll", () => {
    if (list.scrollTop < 120) loadOlder();
    stuckToBottom = Date.now() > noStickUntil && atBottom();
    updateScrollDown();
    updateFloatingDate();
  });
  // Capture-phase listeners fire before the media element's own load handlers, which
  // may still resize the bubble (e.g. VideoAttachment's aspect ratio) — scroll again
  // on the next frame so the newest message isn't pushed out of view.
  const keepAtBottom = () => {
    if (!stuckToBottom) return;
    list.scrollTop = list.scrollHeight;
    requestAnimationFrame(() => {
      if (stuckToBottom) list.scrollTop = list.scrollHeight;
    });
  };
  list.addEventListener("load", keepAtBottom, true);
  list.addEventListener("loadedmetadata", keepAtBottom, true);

  function scrollToUnreadDivider() {
    const divider = list.querySelector(".unread-divider");
    if (!divider) return false;
    const offset = divider.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += offset - 12;
    stuckToBottom = atBottom();
    updateScrollDown();
    return true;
  }

  function senderOf(id) {
    return members.find((u) => u.id === id) ?? cachedUser(id);
  }
  let missingSenders = new Set();
  function loadMissingSenders() {
    if (!missingSenders.size) return;
    const ids = [...missingSenders];
    missingSenders = new Set();
    fetchUsers(ids)
      .then((changed) => {
        if (changed && list.isConnected) rerenderListKeepingScroll();
      })
      .catch(() => {});
  }
  function rerenderListKeepingScroll() {
    const wasAtBottom = atBottom();
    const prevTop = list.scrollTop;
    renderList();
    list.scrollTop = wasAtBottom ? list.scrollHeight : prevTop;
  }

  function renderList() {
    clear(list);
    missingSenders = new Set();
    if (hasMoreHistory) {
      list.appendChild(
        el("div", { class: "history-top" }, [
          el("button", { class: "history-top-btn", onclick: loadOlder }, loadingHistory ? "Загружаем…" : "Показать более ранние"),
        ])
      );
    }
    if (!messages.length) {
      list.appendChild(el("p", { class: "empty-hint" }, "Сообщений пока нет — напишите первым"));
    }
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      if (!prev || !sameDay(prev.createdAt, m.createdAt)) {
        list.appendChild(
          el(
            "div",
            { class: "date-divider" },
            el(
              "button",
              {
                class: "date-divider-btn",
                type: "button",
                title: "Перейти к дате",
                onclick: () =>
                  openChatCalendarDialog({
                    chatId: chat.id,
                    around: m.createdAt,
                    onPick: (messageId) => jumpTo(messageId),
                  }),
              },
              dayLabel(m.createdAt)
            )
          )
        );
      }
      if (m.id === firstUnreadId) {
        list.appendChild(el("div", { class: "unread-divider" }, el("span", {}, "Непрочитанные сообщения")));
      }
      const next = messages[i + 1];
      const GROUP_WINDOW_MS = 5 * 60 * 1000;
      const runsWith = (a, b) =>
        !!a &&
        !!b &&
        a.senderId === b.senderId &&
        !a.anonymous === !b.anonymous &&
        a.type === b.type &&
        sameDay(a.createdAt, b.createdAt) &&
        Math.abs(new Date(b.createdAt) - new Date(a.createdAt)) < GROUP_WINDOW_MS;
      const groupStart = !runsWith(prev, m);
      const groupEnd = !runsWith(m, next);
      const showSender = (chat.type === "group" || chat.type === "channel") && groupStart;
      const sender = m.anonymous
        ? { id: chat.id, name: chat.title, avatarColor: chat.avatarColor, avatarImage: chat.avatarImage }
        : senderOf(m.senderId);
      if (!sender && m.senderId && m.type !== "system") missingSenders.add(m.senderId);
      const replyToMessage = m.replyToId ? (messages.find((x) => x.id === m.replyToId) ?? replyTargets.get(m.replyToId)) : undefined;
      const replyToSender =
        replyToMessage && !replyToMessage.deleted
          ? replyToMessage.anonymous
            ? { name: chat.title }
            : senderOf(replyToMessage.senderId)
          : null;
      const bubble = MessageBubble({
          message: withLocalThumbs(m),
          me,
          sender,
          showSender,
          senderTag: showSender && chat.type === "group" && !m.anonymous ? chat.memberTitles?.[m.senderId] ?? null : null,
          groupStart,
          groupEnd,
          isChannel: chat.type === "channel",
          isDm,
          canPin,
          protectedContent: isProtected(),
          allowedReactions: chat.allowedReactions,
          canViewReactionDetails,
          selection: { active: selecting, ids: selected, onToggle: (id) => (selecting ? toggleSelect(id) : startSelecting(id)) },
          replyToMessage,
          replyToSender,
          members,
          handlers: {
            onReply: (msg, opts) => {
              replyingTo = msg;
              editingMessage = null;
              if (opts?.quote) {
                const quoted = opts.quote.split("\n").map((l) => `> ${l}`).join("\n");
                draftText = `${quoted}\n${draftText}`;
              }
              renderComposer();
            },
            onEdit: (msg) => {
              editingMessage = msg;
              replyingTo = null;
              renderComposer();
            },
            onDelete: (msg) => {
              const mine = msg.senderId === me.id || (!isDm && isChatAdmin(chat, me.id)) || isChatModerator(chat, me.id);
              openDeleteMessageDialog({
                canDeleteForEveryone: mine || isDm || isChatAdmin(chat, me.id) || isChatModerator(chat, me.id) || isServerModerator(),
                someoneElses: !mine,
                onDelete: (forEveryone) => handleDelete(msg, forEveryone),
              });
            },
            onReact: handleReact,
            onPin: handlePin,
            onJumpTo: jumpTo,
          onRefresh: refreshMessages,
            onForward: (msg) => openForwardDialog((targetChatId, opts) => handleForward(msg, targetChatId, opts), { allowHideAuthor: true }),
            onVote: handleVote,
            onPollAction: handlePollAction,
            canClosePolls: !isDm && (isChatAdmin(chat, me.id) || isChatModerator(chat, me.id)),
            onKeyboardAction: (action) => handleSend(action, []),
            onKeyboardApp: (msg, appUrl) =>
              openMiniApp({ botId: msg.senderId, botName: senderOf(msg.senderId)?.name, chatId: chat.id, url: appUrl }),
            onOpenThread: isGroup ? (msg) => openThreadPanel({ chat, rootMessage: msg, members, me, onReplySent: refreshMessages }) : undefined,
          },
        });
      list.appendChild(bubble);
      if (isChannel && m.type !== "system" && m.senderId !== me.id && viewObserver && !countedViews.has(m.id)) {
        bubble.dataset.postId = m.id;
        viewObserver.observe(bubble);
      }
      if (isChannel && m.type !== "system" && chat.linkedDiscussionChatId) {
        list.appendChild(
          el(
            "button",
            {
              class: `post-comments-link ${m.senderId === me.id ? "mine" : ""}`,
              onclick: () => openPostComments(m),
            },
            commentsLabel(m.commentCount ?? 0)
          )
        );
      }
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
    loadMissingSenders();
  }

  const countedViews = new Set();
  const viewObserver =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const id = entry.target.dataset.postId;
              viewObserver.unobserve(entry.target);
              if (!id || countedViews.has(id)) continue;
              countedViews.add(id);
              api.viewPost(id).catch(() => {});
            }
          },
          { threshold: 0.6 }
        )
      : null;

  function commentsLabel(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (!n) return "💬 Комментарии";
    if (mod10 === 1 && mod100 !== 11) return `💬 ${n} комментарий`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `💬 ${n} комментария`;
    return `💬 ${n} комментариев`;
  }

  async function openPostComments(post) {
    let data;
    try {
      data = await api.getPostComments(post.id);
    } catch (err) {
      alert(err.message || "Комментарии недоступны");
      return;
    }
    openThreadPanel({
      chat: data.chat,
      rootMessage: data.anchor,
      members: data.members,
      me,
      title: "Комментарии",
      emptyHint: "Комментариев пока нет — напишите первым",
      source: {
        repliesLabel: "Комментарии",
        load: () => api.getPostComments(post.id).then((r) => r.replies),
        send: (text, attachments, extra) => api.sendPostComment(post.id, text, { attachments, ...extra }),
      },
      onReplySent: refreshMessages,
    });
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
    if (isDm && other?.isServiceBot) {
      bodyBottomSlot.appendChild(el("p", { class: "channel-readonly-hint" }, "Shalter — служебный чат: сюда приходят коды входа и уведомления, отвечать в нём нельзя"));
      return;
    }
    if (currentTopic()?.closed && !isChatAdmin(chat, me.id) && !isChatModerator(chat, me.id)) {
      bodyBottomSlot.appendChild(el("p", { class: "channel-readonly-hint" }, "Тема закрыта — писать в неё могут только администраторы"));
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
        replyToName: replyingTo ? (replyingTo.anonymous ? chat.title : (senderOf(replyingTo.senderId)?.name ?? "")) : "",
        editingMessage,
        initialDraft: draftText,
        botCommands,
        paidMessages,
        canPostAnonymously: isGroup && !!chat.anonymousAdmins && (isChatAdmin(chat, me.id) || isChatModerator(chat, me.id)),
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
        canSendWhileUploading: true,
        onSaveEdit: handleSaveEdit,
        onDraftChange: handleDraftChange,
        onScheduled: () => openScheduledMessagesDialog(chat.id),
        topicId: currentTopicId(),
        allowEffects: isDm && !isSaved,
        allowWhenOnline: isDm && !isSaved && !!other && !other.isBot,
        onEditLast: () => {
          const last = [...messages]
            .reverse()
            .find(
              (m) =>
                m.senderId === me.id &&
                !m.pending &&
                !m.forwardedFrom &&
                m.type !== "system" &&
                m.type !== "sticker" &&
                !isCallLogMessage(m) &&
                !!m.text?.trim() &&
                !m.attachments?.some((a) => a.kind === "poll")
            );
          if (!last) return;
          editingMessage = last;
          replyingTo = null;
          renderComposer();
          document.getElementById(`msg-${last.id}`)?.scrollIntoView({ block: "nearest" });
        },
      })
    );
  }

  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
  const composerEl = () => composerSlot.querySelector(".composer");
  mainCol.addEventListener("dragenter", (e) => {
    if (!hasFiles(e) || !composerEl()?.attachDropped) return;
    e.preventDefault();
    dragDepth++;
    mainCol.classList.add("drop-active");
  });
  mainCol.addEventListener("dragover", (e) => {
    if (!hasFiles(e) || !composerEl()?.attachDropped) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  mainCol.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) mainCol.classList.remove("drop-active");
  });
  mainCol.addEventListener("drop", (e) => {
    dragDepth = 0;
    mainCol.classList.remove("drop-active");
    const attach = composerEl()?.attachDropped;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!attach || !files.length) return;
    e.preventDefault();
    attach(files);
  });

  const onChatKeydown = (e) => {
    if (e.key !== "Escape" || document.querySelector(".modal-overlay, .dropdown-menu, .media-viewer-overlay")) return;
    if (selecting) {
      e.stopPropagation();
      clearSelection();
    } else if (searchBar.firstChild) {
      e.stopPropagation();
      closeSearch();
    }
  };
  document.addEventListener("keydown", onChatKeydown, true);

  renderHeader();
  renderList();
  renderComposer();
  if (isGroup && chat.topicsEnabled) loadTopics();
  applyProtection();
  renderInfoPanel();
  loadBotAudience();
  loadLive();
  loadVoiceRoom();
  mount(root, wrap);
  list.scrollTo({ top: list.scrollHeight });
  const focusMessageId = new URLSearchParams(window.location.search).get("msg");
  if (focusMessageId) {
    window.history.replaceState(null, "", window.location.pathname);
    awaitingUnreadMark = false;
    (async () => {
      if (openedFromCache) await refreshMessages();
      await jumpTo(focusMessageId);
    })();
  } else {
    scrollToUnreadDivider();
  }

  const messagesIv = setInterval(refreshMessages, 15000);
  const lastSeenIv = setInterval(() => {
    if (isDm && other && !other.online && header.isConnected) renderHeader();
  }, 60000);
  const typingIv = setInterval(async () => {
    const r = await api.getTyping(chat.id);
    if (r.typingUserId === typingUserId && (r.typingAction ?? null) === typingAction) return;
    typingUserId = r.typingUserId;
    typingAction = r.typingAction ?? null;
    renderHeader();
  }, 30000);

  const unsubLiveStarted = onWsMessage("live:started", (msg) => {
    if (msg.chatId === chat.id) loadLive();
  });
  const unsubLiveEnded = onWsMessage("live:ended", (msg) => {
    if (msg.chatId === chat.id) loadLive();
  });

  const unsubVoiceChat = onWsMessage("voicechat:updated", (msg) => {
    if (msg.chatId !== chat.id) return;
    voiceRoom = msg.call;
    renderHeader();
  });

  const unsubPresence = onWsMessage("presence:update", (msg) => {
    if (!other || msg.userId !== other.id) return;
    other.online = msg.online;
    other.lastSeen = msg.lastSeen;
    renderHeader();
  });
  const unsubContactUpdated = onWsMessage("contact:updated", (msg) => {
    if (!msg.user?.id) return;
    rememberUser(msg.user);
    const idx = members.findIndex((u) => u.id === msg.user.id);
    if (idx !== -1) members[idx] = { ...members[idx], ...msg.user };
    if (other && msg.user.id === other.id) {
      Object.assign(other, msg.user);
      renderHeader();
      renderInfoPanel();
    }
    if (idx !== -1 && !isDm) rerenderListKeepingScroll();
  });
  const unsubMessageNew = onWsMessage("message:new", (msg) => {
    if (msg.chatId !== chat.id) return;
    if (typingUserId && msg.message?.senderId === typingUserId) clearTypingStatus();
    scheduleRefresh();
  });
  const unsubMessageUpdated = onWsMessage("message:updated", (msg) => {
    if (msg.chatId !== chat.id) return;
    scheduleRefresh();
  });
  const unsubMessageDeleted = onWsMessage("message:deleted", (msg) => {
    if (msg.chatId !== chat.id) return;
    scheduleRefresh();
  });
  const unsubMessageRead = onWsMessage("message:read", (msg) => {
    if (msg.chatId !== chat.id) return;
    scheduleRefresh();
  });
  let typingClearTimer = null;
  const clearTypingStatus = () => {
    clearTimeout(typingClearTimer);
    typingUserId = null;
    typingAction = null;
    renderHeader();
  };
  const unsubTyping = onWsMessage("typing:update", (msg) => {
    if (msg.chatId !== chat.id) return;
    if (msg.action === "cancel") {
      if (msg.userId === typingUserId) clearTypingStatus();
      return;
    }
    typingUserId = msg.userId;
    typingAction = msg.action ?? "typing";
    renderHeader();
    clearTimeout(typingClearTimer);
    typingClearTimer = setTimeout(clearTypingStatus, 4000);
  });

  const unsubTopics = onWsMessage("topics:updated", (msg) => {
    if (msg.chatId === chat.id) loadTopics();
  });
  const unsubChatUpdated = onWsMessage("chat:updated", (msg) => {
    if (msg.chat?.id !== chat.id) return;
    const { pinned, archived, muted, mutedUntil, ...shared } = msg.chat;
    const topicsWas = !!chat.topicsEnabled;
    const protectedWas = isProtected();
    chat = { ...chat, ...shared };
    if (protectedWas !== isProtected()) {
      applyProtection();
      renderList();
    }
    if (topicsWas !== !!chat.topicsEnabled) {
      if (!chat.topicsEnabled) topicFilter = undefined;
      loadTopics();
      scheduleRefresh(0);
    }
    renderHeader();
    applyWallpaper(list, chat);
    api
      .getChat(chat.id)
      .then((res) => {
        paidMessages = res.paidMessages ?? null;
        renderComposer();
      })
      .catch(() => {});
  });

  if (openedFromCache) {
    api
      .getChat(chatId)
      .then((res) => {
        chat = res.chat;
        members = res.members;
        botCommands = res.commands ?? null;
        paidMessages = res.paidMessages ?? null;
        other = chat.otherUser ?? (isDm ? members.find((u) => u.id !== me.id) : null) ?? null;
        renderHeader();
        renderContactBar();
        renderInfoPanel();
        rerenderListKeepingScroll();
        renderComposer();
      })
      .catch(() => {});
    scheduleRefresh(0);
  }

  const onHashtag = (e) => openSearch(e.detail);
  window.addEventListener("shalter:hashtag", onHashtag);
  const onJumpMessage = (e) => {
    if (e.detail?.chatId === chatId && e.detail.messageId) jumpTo(e.detail.messageId);
  };
  window.addEventListener("shalter:jump-message", onJumpMessage);

  root._cleanup = () => {
    window.removeEventListener("shalter:hashtag", onHashtag);
    window.removeEventListener("shalter:jump-message", onJumpMessage);
    document.body.classList.remove("protected-chat-open");
    document.removeEventListener("keydown", onChatKeydown, true);
    clearInterval(messagesIv);
    clearInterval(lastSeenIv);
    clearInterval(typingIv);
    clearTimeout(typingClearTimer);
    clearTimeout(msgTimer);
    unsubLiveStarted();
    unsubLiveEnded();
    unsubVoiceChat();
    unsubPresence();
    unsubContactUpdated();
    unsubMessageNew();
    unsubMessageUpdated();
    unsubMessageDeleted();
    unsubMessageRead();
    unsubTyping();
    unsubChatUpdated();
    unsubTopics();
    viewObserver?.disconnect();
  };
}
