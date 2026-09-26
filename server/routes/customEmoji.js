const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser } = require("../data/users");
const { hasAdminSection } = require("../lib/adminAccess");
const { listAllEmoji, createEmoji, updateEmoji, deleteEmoji, MAX_EMOJI } = require("../data/customEmoji");

// Кастомные эмодзи — общий каталог, как подарки: смотреть и вставлять может
// любой вошедший, а создавать/править/удалять — только админ (раздел
// «emojicatalog», выдаётся так же, как «Каталог подарков»). Сцена self-contained
// едет в сообщение (server/routes/messages.js), получателю ничего не дозапросить.
const router = express.Router();
router.use(requireUserId);

async function requireEmojiAdmin(req, res) {
  const me = await getUser(req.uid);
  if (!hasAdminSection(me, "emojicatalog")) {
    res.status(403).json({ error: "Недостаточно прав" });
    return false;
  }
  return true;
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    res.json({ emoji: listAllEmoji(), maxEmoji: MAX_EMOJI });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    if (!(await requireEmojiAdmin(req, res))) return;
    const { name, scene } = req.body ?? {};
    const result = createEmoji({ creatorId: req.uid, name, scene });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ emoji: result.emoji });
  })
);

router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireEmojiAdmin(req, res))) return;
    const { name, scene } = req.body ?? {};
    const result = updateEmoji(req.params.id, { name, scene });
    if (result.notFound) return res.status(404).json({ error: "Эмодзи не найден" });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ emoji: result.emoji });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    if (!(await requireEmojiAdmin(req, res))) return;
    if (!deleteEmoji(req.params.id)) return res.status(404).json({ error: "Эмодзи не найден" });
    res.json({ ok: true });
  })
);

module.exports = router;
