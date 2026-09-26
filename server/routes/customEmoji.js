const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listEmojiFor, createEmoji, deleteEmoji, MAX_EMOJI } = require("../data/customEmoji");

// Кастомные эмодзи, нарисованные пользователем в аниматоре
// (public/js/components/animatorEditor.js). Хранятся по владельцу и
// вставляются в текст сообщения — сама сцена уходит в сообщение self-contained,
// поэтому получателю не нужно ничего дозапрашивать у автора.
const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json({ emoji: listEmojiFor(req.uid), maxEmoji: MAX_EMOJI });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { name, scene } = req.body ?? {};
    const result = createEmoji({ ownerId: req.uid, name, scene });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ emoji: result.emoji });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    if (!deleteEmoji(req.params.id, req.uid)) return res.status(404).json({ error: "Эмодзи не найден" });
    res.json({ ok: true });
  })
);

module.exports = router;
