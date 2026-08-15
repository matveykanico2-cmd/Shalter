const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat, updateChat } = require("../data/chats");
const { addMessage, getMessage, listThreadReplies, setAnchorForPost, setDiscussionAnchor, incrementViews } = require("../data/messages");
const { recordView } = require("../data/postViews");
const { getUser } = require("../data/users");
const { publicUsers } = require("../data/sanitize");
const { deliverMessage } = require("./messages");
const { sanitizeAttachments } = require("../lib/sanitizeAttachments");

const router = express.Router();
router.use(requireUserId);

// Publishing a channel post auto-forwards a copy into the linked discussion
// chat (Telegram's real "channel + discussion group" pattern) — that
// forwarded copy becomes the anchor comments reply to, via replyToId.
router.post(
  "/:channelId/publish",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.channelId);
    if (!chat || chat.type !== "channel") return res.status(404).json({ error: "not found" });
    // Ownership is a list (see server/routes/chats.js's isOwner) — a co-owner
    // must not be locked out of publishing.
    const isOwnerOrAdmin =
      chat.ownerId === req.uid || (chat.ownerIds ?? []).includes(req.uid) || chat.adminIds?.includes(req.uid);
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Публиковать могут только администраторы канала" });

    const body = req.body ?? {};
    if (!body.text?.trim() && !body.attachments?.length) {
      return res.status(400).json({ error: "empty post" });
    }

    let post = await addMessage({
      id: `m_${Date.now()}`,
      chatId: chat.id,
      senderId: req.uid,
      type: "text",
      text: body.text ?? "",
      createdAt: new Date().toISOString(),
      pinned: false,
      reactions: [],
      attachments: sanitizeAttachments(body.attachments),
      readByIds: [req.uid],
      views: 0,
      commentCount: 0,
      // A signed channel names the person who wrote each post; an unsigned one
      // speaks with a single voice. Recorded on the message, not derived at read
      // time, so turning the setting off later doesn't rewrite what was already
      // published under someone's name.
      signedBy: chat.signMessages ? (await getUser(req.uid))?.name ?? null : null,
    });

    if (chat.linkedDiscussionChatId) {
      const discussionChat = await getChat(chat.linkedDiscussionChatId);
      if (discussionChat) {
        const author = await getUser(req.uid);
        const anchor = await addMessage({
          id: `m_${Date.now() + 1}`,
          chatId: discussionChat.id,
          senderId: req.uid,
          type: "text",
          text: post.text,
          createdAt: new Date().toISOString(),
          pinned: false,
          reactions: [],
          attachments: post.attachments,
          readByIds: [req.uid],
          forwardedFrom: { chatId: chat.id, chatTitle: chat.title, senderId: req.uid, senderName: author?.name ?? "Канал" },
        });
        await setAnchorForPost(anchor.id, post.id);
        post = await setDiscussionAnchor(post.id, anchor.id);
      }
    }

    res.json({ message: post });
  })
);

// ── Просмотры поста ─────────────────────────────────────────────────────────
//
// Под каждым постом канала рисуется «N 👁» (components/messageBubble.js), и
// число это всегда было нулём: столбец views существовал, функция
// incrementViews в data/messages.js существовала, а вызывать её было некому.
// Счётчик, который никогда не растёт, хуже отсутствующего — он выглядит как
// правда и врёт.
//
// Считается по одному разу с человека, а не за каждое открытие — кто уже
// засчитан, помнит data/postViews.js. Накрутить собственным перезаходом нельзя.
router.post(
  "/:postId/view",
  asyncRoute(async (req, res) => {
    const post = await getMessage(req.params.postId);
    if (!post) return res.status(404).json({ error: "Пост не найден" });
    const channel = await getChat(post.chatId);
    if (!channel || channel.type !== "channel") return res.status(400).json({ error: "Просмотры считаются только у постов канала" });
    if (!channel.memberIds.includes(req.uid) && !channel.username) {
      return res.status(403).json({ error: "Пост недоступен" });
    }
    // Автор собственному посту просмотр не добавляет — иначе у любого поста
    // сразу единица, и «сколько человек прочитало» перестаёт быть ответом.
    if (post.senderId === req.uid) return res.json({ views: post.views ?? 0, counted: false });
    if (!recordView(post.id, req.uid)) return res.json({ views: post.views ?? 0, counted: false });

    const updated = await incrementViews(post.id);
    res.json({ views: updated?.views ?? (post.views ?? 0) + 1, counted: true });
  })
);

// ── Комментарии к отдельному посту ──────────────────────────────────────────
//
// Под каждым постом канала — своя ветка, а не общий чат обсуждения. Раньше
// ссылка «N комментариев» вела в связанную группу целиком, и комментарии к
// разным постам лежали там вперемешку: чтобы прочитать обсуждение конкретного
// поста, приходилось глазами выискивать его среди чужих.
//
// Устроено поверх уже имеющегося: у поста есть якорь — его копия в группе
// обсуждения (см. публикацию выше), а комментарий это ответ в ветку этого
// якоря (threadRootId). Ветки уже умеют всё нужное — свой список, свою
// трансляцию по WebSocket, свой счётчик, — и переиспользовать их правильнее,
// чем заводить второй механизм с тем же смыслом.
async function resolveComments(postId, uid) {
  const post = await getMessage(postId);
  if (!post) return { status: 404, error: "Пост не найден" };
  const channel = await getChat(post.chatId);
  if (!channel) return { status: 404, error: "Канал не найден" };
  // Читать комментарии может тот, кто видит сам пост: подписчик канала или
  // любой, если канал публичный.
  const canSee = channel.memberIds.includes(uid) || !!channel.username;
  if (!canSee) return { status: 403, error: "Комментарии доступны подписчикам канала" };
  if (!post.discussionAnchorId || !channel.linkedDiscussionChatId) {
    return { status: 404, error: "У канала нет группы обсуждения — комментарии выключены" };
  }
  const discussion = await getChat(channel.linkedDiscussionChatId);
  const anchor = await getMessage(post.discussionAnchorId);
  if (!discussion || !anchor) return { status: 404, error: "Обсуждение недоступно" };
  return { post, channel, discussion, anchor };
}

router.get(
  "/:postId/comments",
  asyncRoute(async (req, res) => {
    const found = await resolveComments(req.params.postId, req.uid);
    if (found.error) return res.status(found.status).json({ error: found.error });

    const replies = await listThreadReplies(found.anchor.id);
    const members = await Promise.all(found.discussion.memberIds.map((id) => getUser(id)));
    res.json({
      post: found.post,
      anchor: found.anchor,
      chat: { id: found.discussion.id, title: found.discussion.title },
      // Автор комментария может уже покинуть группу — его всё равно надо
      // подписать по имени, поэтому берём и участников, и авторов ответов.
      members: publicUsers([...members, ...(await Promise.all(replies.map((r) => getUser(r.senderId))))].filter(Boolean)),
      replies,
      canComment: found.discussion.memberIds.includes(req.uid) || !!found.discussion.username || !!found.channel.username,
    });
  })
);

router.post(
  "/:postId/comments",
  asyncRoute(async (req, res) => {
    const found = await resolveComments(req.params.postId, req.uid);
    if (found.error) return res.status(found.status).json({ error: found.error });

    // Вступление в группу обсуждения происходит само, первым комментарием —
    // как в телеграме. Требовать «сначала вступите в группу» значит требовать
    // действия, смысл которого человеку неочевиден: он хочет ответить на пост,
    // а не присоединиться к чату, о существовании которого мог и не знать.
    let discussion = found.discussion;
    if (!discussion.memberIds.includes(req.uid)) {
      discussion = await updateChat(discussion.id, { memberIds: [...discussion.memberIds, req.uid] });
    }

    const body = req.body ?? {};
    if (!body.text?.trim() && !body.attachments?.length) return res.status(400).json({ error: "Напишите комментарий" });

    const message = await deliverMessage(discussion, req.uid, { ...body, threadRootId: found.anchor.id });
    res.json({ message });
  })
);

module.exports = router;
