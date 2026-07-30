const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { getChat } = require("../data/chats");
const {
  listMessages,
  addMessage,
  getMessage,
  editMessage,
  deleteMessage,
  deleteMessageForMe,
  togglePin,
  toggleReaction,
  incrementCommentCount,
  votePoll,
} = require("../data/messages");
const { getBotByUserId } = require("../data/bots");
const { getUser } = require("../data/users");
const { getSettings } = require("../data/settings");

const router = express.Router({ mergeParams: true });

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }
    const settings = await getSettings(req.uid);
    const messages = await listMessages(req.params.id, req.uid, settings.chatClears?.[req.params.id]);
    res.json({ messages });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) {
      return res.status(404).json({ error: "not found" });
    }

    const body = req.body ?? {};
    if (!body.text?.trim() && !body.attachments?.length) {
      return res.status(400).json({ error: "empty message" });
    }

    if (chat.type === "dm") {
      const otherId = chat.memberIds.find((m) => m !== req.uid);
      const other = otherId ? await getUser(otherId) : undefined;
      if (other?.blockedUserIds?.includes(req.uid)) {
        return res.status(403).json({ error: "Пользователь заблокировал вас" });
      }
    }

    const message = await addMessage({
      id: `m_${Date.now()}`,
      chatId: req.params.id,
      senderId: req.uid,
      type: "text",
      text: body.text ?? "",
      createdAt: new Date().toISOString(),
      pinned: false,
      reactions: [],
      replyToId: body.replyToId ?? null,
      attachments: body.attachments,
      forwardedFrom: body.forwardedFrom,
      readByIds: [req.uid],
    });

    // Bot chats auto-reply so the composer + inline-keyboard flow is testable end to end.
    const botMemberId = chat.memberIds.find((m) => m !== req.uid);
    const bot = botMemberId ? await getBotByUserId(botMemberId) : undefined;
    if (bot) {
      const city = (body.text ?? "").replace(/^\/weather\s*/i, "").trim() || "Москва";
      await addMessage({
        id: `m_${Date.now() + 1}`,
        chatId: req.params.id,
        senderId: bot.userId,
        type: "text",
        text: `${city}: +${18 + (city.length % 10)}°C, переменная облачность`,
        createdAt: new Date().toISOString(),
        pinned: false,
        reactions: [],
        readByIds: [],
        keyboard: [[{ text: "Обновить", action: `/weather ${city}` }, { text: "Другой город", action: "/weather" }]],
      });
    }

    // A comment on a channel post is just a reply to that post's auto-forwarded
    // anchor copy in the linked discussion chat (see server/routes/posts.js) —
    // bump the post's visible comment count when one lands.
    if (message.replyToId) {
      const anchor = await getMessage(message.replyToId);
      if (anchor?.anchorForPostId) await incrementCommentCount(anchor.anchorForPostId);
    }

    res.json({ message });
  })
);

router.patch(
  "/:messageId",
  asyncRoute(async (req, res) => {
    const existing = await getMessage(req.params.messageId);
    if (!existing || existing.senderId !== req.uid) {
      return res.status(403).json({ error: "forbidden" });
    }
    const { text } = req.body ?? {};
    const message = await editMessage(req.params.messageId, text);
    res.json({ message });
  })
);

router.delete(
  "/:messageId",
  asyncRoute(async (req, res) => {
    const existing = await getMessage(req.params.messageId);
    if (!existing) return res.status(404).json({ error: "not found" });
    const forEveryone = !!(req.body ?? {}).forEveryone;

    if (forEveryone) {
      // Only the sender can erase a message for everyone.
      if (existing.senderId !== req.uid) return res.status(403).json({ error: "forbidden" });
      await deleteMessage(req.params.messageId);
      return res.json({ ok: true, id: req.params.messageId, forEveryone: true });
    }

    // "Delete for me" — any chat member can hide any message from their own view.
    const chat = await getChat(req.params.id);
    if (!chat || !chat.memberIds.includes(req.uid)) return res.status(404).json({ error: "not found" });
    await deleteMessageForMe(req.params.messageId, req.uid);
    res.json({ ok: true, id: req.params.messageId, forEveryone: false });
  })
);

router.post(
  "/:messageId/pin",
  asyncRoute(async (req, res) => {
    const { pinned } = req.body ?? {};
    const message = await togglePin(req.params.messageId, pinned);
    res.json({ message });
  })
);

router.post(
  "/:messageId/react",
  asyncRoute(async (req, res) => {
    const { emoji } = req.body ?? {};
    const message = await toggleReaction(req.params.messageId, emoji, req.uid);
    res.json({ message });
  })
);

router.post(
  "/:messageId/vote",
  asyncRoute(async (req, res) => {
    const { optionIndex } = req.body ?? {};
    const message = await votePoll(req.params.messageId, optionIndex, req.uid);
    res.json({ message });
  })
);

module.exports = router;
