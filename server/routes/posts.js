const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getChat } = require("../data/chats");
const { addMessage, setAnchorForPost, setDiscussionAnchor } = require("../data/messages");
const { getUser } = require("../data/users");
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

module.exports = router;
