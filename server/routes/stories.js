const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { TTL_MS, listStoriesForUsers, addStory, markViewed, deleteStory } = require("../data/stories");
const { listContactsFor } = require("../data/contacts");
const { getUser } = require("../data/users");
const { publicUser } = require("../data/sanitize");

const router = express.Router();
router.use(requireUserId);

// Stories from your contacts + your own — same "who can see this" boundary
// Telegram/Instagram use (people you follow), and this app already has a
// contacts list to reuse for it rather than "everyone" or "nobody".
async function visibleAuthorIds(uid) {
  const contacts = await listContactsFor(uid);
  return [uid, ...contacts.map((c) => c.userId)];
}

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const authorIds = await visibleAuthorIds(req.uid);
    const stories = await listStoriesForUsers(authorIds);

    const byAuthor = new Map();
    for (const s of stories) {
      if (!byAuthor.has(s.userId)) byAuthor.set(s.userId, []);
      byAuthor.get(s.userId).push(s);
    }

    const groups = await Promise.all(
      [...byAuthor.entries()].map(async ([userId, items]) => {
        const user = await getUser(userId);
        const sorted = items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return {
          user: user ? publicUser(user) : null,
          stories: sorted.map((s) => ({ ...s, viewed: s.viewedByIds.includes(req.uid) })),
        };
      })
    );

    res.json({ groups: groups.filter((g) => g.user) });
  })
);

// Истории одного человека — для кнопки в его профиле. Границу видимости
// повторяем ту же, что и в ленте выше: свои истории видно всегда, чужие —
// если человек у вас в контактах. Иначе профиль стал бы обходным путём
// смотреть истории тех, кто вам их не показывает.
router.get(
  "/user/:userId",
  asyncRoute(async (req, res) => {
    const targetId = req.params.userId;
    const allowed = await visibleAuthorIds(req.uid);
    if (!allowed.includes(targetId)) return res.json({ group: null });

    const stories = await listStoriesForUsers([targetId]);
    if (!stories.length) return res.json({ group: null });

    const user = await getUser(targetId);
    if (!user) return res.json({ group: null });
    res.json({
      group: {
        user: publicUser(user),
        stories: stories
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((st) => ({ ...st, viewed: st.viewedByIds.includes(req.uid) })),
      },
    });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const { kind, url } = req.body ?? {};
    if (!["image", "video"].includes(kind) || !url) {
      return res.status(400).json({ error: "invalid story" });
    }
    const now = Date.now();
    const story = await addStory({
      id: `st_${now}`,
      userId: req.uid,
      kind,
      url,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      viewedByIds: [],
    });
    res.json({ story });
  })
);

router.post(
  "/:id/view",
  asyncRoute(async (req, res) => {
    const story = await markViewed(req.params.id, req.uid);
    res.json({ story });
  })
);

// Кто смотрел историю. Только автору: список зрителей — это про того, кто
// выложил, и посторонним знать, кто что смотрел, незачем.
router.get(
  "/:id/viewers",
  asyncRoute(async (req, res) => {
    const story = (await listStoriesForUsers([req.uid])).find((st) => st.id === req.params.id);
    if (!story) return res.status(404).json({ error: "not found" });
    const users = await Promise.all(story.viewedByIds.filter((id) => id !== req.uid).map((id) => getUser(id)));
    res.json({ viewers: users.filter(Boolean).map(publicUser) });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const ok = await deleteStory(req.params.id, req.uid);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  })
);

module.exports = router;
