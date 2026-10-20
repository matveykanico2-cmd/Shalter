const express = require("express");
const { genId } = require("../lib/genId");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat, updateChat } = require("../data/chats");
const { addMessage, getMessage, listThreadReplies, setAnchorForPost, setDiscussionAnchor, incrementViews } = require("../data/messages");
const { recordView } = require("../data/postViews");
const { getUser } = require("../data/users");
const { publicUsers } = require("../data/sanitize");
const { deliverMessage, sendGate, pushNewMessage, preparePaidMedia } = require("./messages");
const { registerAttachments } = require("../lib/uploadAccess");
const { broadcastToUsers } = require("../ws");
const paidMedia = require("../data/paidMedia");
const { isStaff } = require("../lib/chatPermissions");
const { sanitizeAttachments } = require("../lib/sanitizeAttachments");
const { sendOnce } = require("../lib/sendOnce");

const router = express.Router();
router.use(requireUserId);

router.post(
  "/:channelId/publish",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.channelId);
    // Постороннему закрытый канал не раскрываем: 404, как будто его нет.
    if (!chat || chat.type !== "channel" || (!chat.isPublic && !chat.memberIds.includes(req.uid))) {
      return res.status(404).json({ error: "not found" });
    }
    const isOwnerOrAdmin =
      chat.ownerId === req.uid || (chat.ownerIds ?? []).includes(req.uid) || chat.adminIds?.includes(req.uid);
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Публиковать могут только администраторы канала" });

    const body = req.body ?? {};
    if (body.text != null && typeof body.text !== "string") return res.status(400).json({ error: "Некорректный текст" });
    if (!body.text?.trim() && !body.attachments?.length) {
      return res.status(400).json({ error: "empty post" });
    }
    if (typeof body.text === "string" && body.text.length > 4096) {
      return res.status(400).json({ error: "Пост длиннее 4096 символов" });
    }

    const paid = preparePaidMedia(chat, req.uid, body);
    if (paid?.error) return res.status(400).json({ error: paid.error });
    const post = await sendOnce(req.uid, chat.id, body.clientId, () => publishPost(chat, req.uid, body, paid));
    res.json({ message: post });
  })
);

async function publishPost(chat, uid, body, paid = null) {
  let post = await addMessage({
    id: genId("m"),
    chatId: chat.id,
    senderId: uid,
    type: "text",
    text: body.text ?? "",
    createdAt: new Date().toISOString(),
    pinned: false,
    reactions: [],
    attachments: paid ? [paid.placeholder] : sanitizeAttachments(body.attachments),
    readByIds: [uid],
    views: 0,
    commentCount: 0,
    signedBy: chat.signMessages ? (await getUser(uid))?.name ?? null : null,
  });

  // Комментарии выключены — пост не копируем в группу обсуждения: под ним их не будет.
  if (chat.linkedDiscussionChatId && !chat.commentsOff) {
    const discussionChat = await getChat(chat.linkedDiscussionChatId);
    if (discussionChat) {
      const author = await getUser(uid);
      const anchor = await addMessage({
        id: genId("m"),
        chatId: discussionChat.id,
        senderId: uid,
        type: "text",
        text: post.text,
        createdAt: new Date().toISOString(),
        pinned: false,
        reactions: [],
        attachments: post.attachments,
        readByIds: [uid],
        forwardedFrom: { chatId: chat.id, chatTitle: chat.title, senderId: uid, senderName: author?.name ?? "Канал" },
      });
      await setAnchorForPost(anchor.id, post.id);
      post = await setDiscussionAnchor(post.id, anchor.id);
    }
  }
  // Раньше пост не рассылался: подписчики видели его только после опроса (до минуты),
  // а файлы поста не были привязаны к каналу.
  registerAttachments(chat.id, post.attachments, { by: uid });
  // Настоящие файлы платного поста к каналу не привязываются (lib/uploadAccess.js).
  if (paid) paidMedia.savePaidMedia(post.id, chat.id, paid.stars, paid.real);
  broadcastToUsers(chat.memberIds.filter((id) => id !== uid), { type: "message:new", chatId: chat.id, message: post });
  getUser(uid)
    .then((author) => pushNewMessage(chat, author, post))
    .catch((err) => console.error("channel post push failed:", err));
  return post;
}

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
    if (post.senderId === req.uid) return res.json({ views: post.views ?? 0, counted: false });
    if (!recordView(post.id, req.uid)) return res.json({ views: post.views ?? 0, counted: false });

    const updated = await incrementViews(post.id);
    res.json({ views: updated?.views ?? (post.views ?? 0) + 1, counted: true });
  })
);

async function resolveComments(postId, uid) {
  const post = await getMessage(postId);
  if (!post) return { status: 404, error: "Пост не найден" };
  const channel = await getChat(post.chatId);
  if (!channel) return { status: 404, error: "Канал не найден" };
  const canSee = channel.memberIds.includes(uid) || !!channel.username;
  if (!canSee) return { status: 403, error: "Комментарии доступны подписчикам канала" };
  if (channel.commentsOff) return { status: 403, error: "В этом канале комментарии отключены" };
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
    const memberIds = [...new Set([...found.discussion.memberIds, ...replies.map((r) => r.senderId)])];
    const byId = new Map((await Promise.all(memberIds.map((id) => getUser(id)))).filter(Boolean).map((u) => [u.id, u]));
    // Сколько стоит комментарий и берёт ли его этот пользователь: платёж живёт
    // в sendGate, условия логики повторяем здесь, чтобы панель показала цену
    // заранее, а не после неудачной отправки.
    const price = found.channel.commentPriceStars ?? 0;
    const sender = await getUser(req.uid);
    const priceFree = !price || sender?.isPremium || isStaff(found.channel, req.uid);
    res.json({
      post: found.post,
      anchor: found.anchor,
      chat: { id: found.discussion.id, title: found.discussion.title },
      // Участники обсуждения и авторы ответов — каждый по одному разу.
      members: publicUsers(memberIds.map((id) => byId.get(id)).filter(Boolean)),
      replies,
      // Те же условия, что у POST: доступ к ветке (resolveComments) и нет бана в обсуждении.
      canComment: !(found.discussion.bannedIds ?? []).includes(req.uid),
      commentPriceStars: price,
      commentPriceFree: priceFree,
    });
  })
);

router.post(
  "/:postId/comments",
  asyncRoute(async (req, res) => {
    const found = await resolveComments(req.params.postId, req.uid);
    if (found.error) return res.status(found.status).json({ error: found.error });

    let discussion = found.discussion;
    if ((discussion.bannedIds ?? []).includes(req.uid)) return res.status(403).json({ error: "Вас заблокировали в обсуждении" });

    const body = req.body ?? {};
    if (body.text != null && typeof body.text !== "string") return res.status(400).json({ error: "Некорректный текст" });
    if (!body.text?.trim() && !body.attachments?.length) return res.status(400).json({ error: "Напишите комментарий" });

    // Те же проверки, что у обычной отправки: ограничения, права, платные комментарии.
    // Проверяем как будто уже участник, а в обсуждение добавляем только после успеха —
    // иначе после 402 человек оставался бы в группе, так и не прокомментировав.
    const joining = !discussion.memberIds.includes(req.uid);
    const gate = await sendGate(joining ? { ...discussion, memberIds: [...discussion.memberIds, req.uid] } : discussion, req.uid, body);
    if (gate.status) return res.status(gate.status).json(gate.payload);
    if (joining) discussion = await updateChat(discussion.id, { memberIds: [...discussion.memberIds, req.uid] });

    const message = await deliverMessage(discussion, req.uid, { ...body, threadRootId: found.anchor.id }, { paidStars: gate.charged });
    res.json({ message, ...(gate.charged ? { chargedStars: gate.charged } : {}) });
  })
);

module.exports = router;
