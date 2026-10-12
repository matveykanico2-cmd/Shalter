const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { SHALTER_AI_ID, ensureShalterAiAccount } = require("../data/shalterAiBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { listMessages } = require("../data/messages");
const { WELCOME } = require("../lib/shalterAi");

const router = express.Router();
router.use(requireUserId);

// Чат с Shalter AI (меню → «Shalter AI»): создаём при первом открытии и здороваемся.
router.post(
  "/chat",
  asyncRoute(async (req, res) => {
    ensureShalterAiAccount();
    const chat = await findOrCreateDm(req.uid, SHALTER_AI_ID);
    const existing = await listMessages(chat.id, req.uid);
    if (existing.length === 0) await sendMessageAndBroadcast(chat, SHALTER_AI_ID, WELCOME);
    res.json({ chatId: chat.id });
  })
);

module.exports = router;
