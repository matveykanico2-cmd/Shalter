const express = require("express");
const { genId } = require("../lib/genId");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat, updateChat } = require("../data/chats");
const { addMessage, getMessage, listThreadReplies, setAnchorForPost, setDiscussionAnchor, incrementViews } = require("../data/messages");
const { recordView } = require("../data/postViews");
const { getUser } = require("../data/users");
const { publicUsers } = require("../data/sanitize");
const { deliverMessage, sendGate } = require("./messages");
const { isStaff } = require("../lib/chatPermissions");
const { sanitizeAttachments } = require("../lib/sanitizeAttachments");

const router = express.Router();
router.use(requireUserId);

router.post(
  "/:channelId/publish",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.channelId);
    if (!chat || chat.type !== "channel") return res.status(404).json({ error: "not found" });
    const isOwnerOrAdmin =
      chat.ownerId === req.uid || (chat.ownerIds ?? []).includes(req.uid) || chat.adminIds?.includes(req.uid);
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Публиковать могут только администраторы канала" });

    const body = req.body ?? {};
    if (!body.text?.trim() && !body.attachments?.length) {
      return res.status(400).json({ error: "empty post" });
    }
    if (typeof body.text === "string" && body.text.length > 4096) {
      return res.status(400).json({ error: "Пост длиннее 4096 символов" });
    }

    let post = await addMessage({
      id: genId("m"),
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
      signedBy: chat.signMessages ? (await getUser(req.uid))?.name ?? null : null,
    });

    if (chat.linkedDiscussionChatId) {
      const discussionChat = await getChat(chat.linkedDiscussionChatId);
      if (discussionChat) {
        const author = await getUser(req.uid);
        const anchor = await addMessage({
          id: genId("m"),
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
      members: publicUsers([...members, ...(await Promise.all(replies.map((r) => getUser(r.senderId))))].filter(Boolean)),
      replies,
      canComment: found.discussion.memberIds.includes(req.uid) || !!found.discussion.username || !!found.channel.username,
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
    if (!body.text?.trim() && !body.attachments?.length) return res.status(400).json({ error: "Напишите комментарий" });

    if (!discussion.memberIds.includes(req.uid)) {
      discussion = await updateChat(discussion.id, { memberIds: [...discussion.memberIds, req.uid] });
    }
    // Те же проверки, что у обычной отправки: ограничения, права, платные комментарии.
    const gate = await sendGate(discussion, req.uid, body);
    if (gate.status) return res.status(gate.status).json(gate.payload);

    const message = await deliverMessage(discussion, req.uid, { ...body, threadRootId: found.anchor.id }, { paidStars: gate.charged });
    res.json({ message, ...(gate.charged ? { chargedStars: gate.charged } : {}) });
  })
);

module.exports = router;
