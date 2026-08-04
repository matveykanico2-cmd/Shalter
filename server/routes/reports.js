const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { addReport } = require("../data/reports");
const { getUser } = require("../data/users");
const { getChat } = require("../data/chats");
const { getMessage } = require("../data/messages");

const router = express.Router();
router.use(requireUserId);

const REASONS = new Set(["spam", "scam", "violence", "illegal", "child_safety", "other"]);

// No moderation queue/admin UI on top of this yet (that's a separate, much
// bigger feature) — this just gets a report reliably recorded server-side
// with who/what/why, which is the part that actually needs to exist first.
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { targetType, targetId, reason, details } = req.body ?? {};
    if (!["user", "chat", "message"].includes(targetType)) {
      return res.status(400).json({ error: "invalid target type" });
    }
    if (!REASONS.has(reason)) {
      return res.status(400).json({ error: "invalid reason" });
    }

    let target;
    if (targetType === "user") target = await getUser(targetId);
    else if (targetType === "chat") target = await getChat(targetId);
    else {
      target = await getMessage(targetId);
      if (target) {
        const chat = await getChat(target.chatId);
        if (!chat || !chat.memberIds.includes(req.uid)) target = null;
      }
    }
    if (!target) return res.status(404).json({ error: "not found" });
    if (targetType === "user" && targetId === req.uid) {
      return res.status(400).json({ error: "Нельзя пожаловаться на себя" });
    }
    if (targetType === "message" && target.senderId === req.uid) {
      return res.status(400).json({ error: "Нельзя пожаловаться на своё сообщение" });
    }

    const report = await addReport({
      id: `rp_${Date.now()}`,
      reporterId: req.uid,
      targetType,
      targetId,
      reason,
      details: (details ?? "").trim().slice(0, 2000),
      createdAt: new Date().toISOString(),
      status: "open",
    });
    res.json({ report });
  })
);

module.exports = router;
