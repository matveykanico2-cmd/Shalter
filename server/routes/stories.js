const crypto = require("crypto");
const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const {
  TTL_MS,
  listStoriesForUsers,
  listArchivedStoriesFor,
  addStory,
  getStoryById,
  markViewed,
  deleteStory,
  toggleLike,
  listComments,
  addComment,
  toggleCommentLike,
  getComment,
  editComment,
  deleteComment,
} = require("../data/stories");
const { getSettings } = require("../data/settings");
const { privacyAllows } = require("../lib/privacyRules");
const { listContactsFor, listOwnersOf } = require("../data/contacts");
const { getUser } = require("../data/users");
const { hasAdminSection } = require("../lib/adminAccess");
const { SYSTEM_BOT_ID } = require("../data/systemBot");
const { findOrCreateDm, sendMessageAndBroadcast } = require("../lib/systemChat");
const { getChat, listChatsForUser } = require("../data/chats");
const { publicUser } = require("../data/sanitize");
const { isSafeUrl } = require("../lib/sanitizeAttachments");
const { broadcastToUsers } = require("../ws");
const { sendPushToUser, userPushAvatar, MESSAGE_PUSH } = require("../push");

const MAX_ITEMS = 10;

function isChannelId(id) {
  return typeof id === "string" && id.startsWith("c_");
}

function isChannelStaff(chat, uid) {
  return chat?.ownerId === uid || (chat?.adminIds ?? []).includes(uid);
}

async function authorInfo(id, viewerId) {
  if (isChannelId(id)) {
    const chat = await getChat(id);
    if (!chat || chat.type !== "channel") return null;
    return {
      id: chat.id,
      name: chat.title,
      username: chat.username ?? null,
      avatarColor: chat.avatarColor,
      avatarImage: chat.avatarImage ?? null,
      isChannel: true,
      canManage: isChannelStaff(chat, viewerId),
    };
  }
  const user = await getUser(id);
  return user ? publicUser(user) : null;
}

function sanitizeStoryItems(body) {
  const { kind, url } = body ?? {};
  const rawItems = Array.isArray(body?.items) && body.items.length ? body.items : [{ kind, url }];
  return rawItems
    .slice(0, MAX_ITEMS)
    .filter((it) => it && ["image", "video"].includes(it.kind) && it.url && isSafeUrl(it.url))
    .map((it) => ({ kind: it.kind, url: it.url }));
}

function audienceOf(authorId) {
  return [...new Set([authorId, ...listOwnersOf(authorId)])];
}

const router = express.Router();
router.use(requireUserId);

// Кто посмотрел и лайкнул — видит только автор (или админ канала).
function storyFor(st, uid, author) {
  const own = st.userId === uid || !!author?.canManage;
  const out = {
    ...st,
    viewed: st.viewedByIds.includes(uid),
    liked: st.likedByIds.includes(uid),
    likeCount: st.likedByIds.length,
    viewCount: st.viewedByIds.length,
  };
  if (!own) {
    delete out.viewedByIds;
    delete out.likedByIds;
  }
  return out;
}

async function blockedBy(authorId, uid) {
  if (isChannelId(authorId)) return false;
  return !!(await getUser(authorId))?.blockedUserIds?.includes(uid);
}

async function visibleAuthorIds(uid) {
  const contacts = await listContactsFor(uid);
  const chats = await listChatsForUser(uid);
  const channelIds = chats.filter((c) => c.type === "channel").map((c) => c.id);
  return [uid, ...contacts.map((c) => c.userId), ...channelIds];
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
      [...byAuthor.entries()].map(async ([authorId, items]) => {
        if (await blockedBy(authorId, req.uid)) return { user: null };
        const user = await authorInfo(authorId, req.uid);
        const sorted = items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return {
          user,
          stories: sorted.map((s) => storyFor(s, req.uid, user)),
        };
      })
    );

    res.json({ groups: groups.filter((g) => g.user) });
  })
);

router.get(
  "/user/:userId",
  asyncRoute(async (req, res) => {
    const targetId = req.params.userId;
    const allowed = await visibleAuthorIds(req.uid);
    if (!allowed.includes(targetId) || (await blockedBy(targetId, req.uid))) return res.json({ group: null });

    const stories = await listStoriesForUsers([targetId]);
    if (!stories.length) return res.json({ group: null });

    const user = await authorInfo(targetId, req.uid);
    if (!user) return res.json({ group: null });
    res.json({
      group: {
        user,
        stories: stories
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((st) => storyFor(st, req.uid, user)),
      },
    });
  })
);

router.get(
  "/user/:userId/archive",
  asyncRoute(async (req, res) => {
    const targetId = req.params.userId;
    const isSelf = targetId === req.uid;

    let channelChat = null;
    if (isChannelId(targetId)) {
      const chat = await getChat(targetId);
      channelChat = chat;
      if (!chat || chat.type !== "channel" || !chat.memberIds.includes(req.uid)) {
        return res.json({ stories: [], allowed: false });
      }
    } else if (!isSelf) {
      const allowed = await visibleAuthorIds(req.uid);
      if (!allowed.includes(targetId)) return res.json({ stories: [], allowed: false });
      const { privacy } = await getSettings(targetId);
      const contacts = await listContactsFor(targetId);
      const isContact = contacts.some((c) => c.userId === req.uid);
      if (!privacyAllows(privacy, "storiesArchive", req.uid, isContact)) {
        return res.json({ stories: [], allowed: false });
      }
    }

    const all = await listArchivedStoriesFor(targetId);
    const now = Date.now();
    res.json({
      allowed: true,
      stories: all.map((st) => ({
        ...storyFor(st, req.uid, isChannelId(targetId) ? { canManage: isChannelStaff(channelChat, req.uid) } : null),
        expired: new Date(st.expiresAt).getTime() <= now,
      })),
    });
  })
);

router.post(
  "/",
  asyncRoute(async (req, res) => {
    const items = sanitizeStoryItems(req.body);
    if (!items.length) return res.status(400).json({ error: "invalid story" });

    const now = Date.now();
    const story = await addStory({
      id: `st_${now}_${crypto.randomBytes(4).toString("hex")}`,
      userId: req.uid,
      items,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      viewedByIds: [],
    });
    broadcastToUsers(audienceOf(req.uid), { type: "story:new", storyId: story.id, userId: req.uid });
    res.json({ story });

    (async () => {
      try {
        const author = await getUser(req.uid);
        const name = author?.name || "Кто-то";
        const targets = audienceOf(req.uid).filter((id) => id !== req.uid);
        await Promise.all(
          targets.map(async (id) =>
            sendPushToUser(id, { title: name, body: "Опубликовал(а) новую историю", ...(await userPushAvatar(author, id)), url: "/", tag: `story-new:${req.uid}` }, MESSAGE_PUSH)
          )
        );
      } catch (err) {
        console.error("story push failed:", err);
      }
    })();
  })
);

router.post(
  "/channel/:chatId",
  asyncRoute(async (req, res) => {
    const chat = await getChat(req.params.chatId);
    if (!chat || chat.type !== "channel") return res.status(400).json({ error: "Истории есть только у каналов" });
    if (!isChannelStaff(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });

    const items = sanitizeStoryItems(req.body);
    if (!items.length) return res.status(400).json({ error: "invalid story" });

    const now = Date.now();
    const story = await addStory({
      id: `st_${now}_${crypto.randomBytes(4).toString("hex")}`,
      userId: chat.id,
      items,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      viewedByIds: [],
    });
    broadcastToUsers(chat.memberIds, { type: "story:new", storyId: story.id, userId: chat.id });
    res.json({ story });
  })
);

router.post(
  "/:id/view",
  asyncRoute(async (req, res) => {
    const allowed = await visibleAuthorIds(req.uid);
    const visible = (await listStoriesForUsers(allowed)).find((st) => st.id === req.params.id);
    if (!visible) return res.status(404).json({ error: "not found" });

    const story = await markViewed(req.params.id, req.uid);
    res.json({ story: story ? storyFor(story, req.uid, null) : story });
  })
);

async function audienceForStory(story) {
  if (isChannelId(story.userId)) {
    const chat = await getChat(story.userId);
    return chat?.memberIds ?? [];
  }
  return audienceOf(story.userId);
}

router.post(
  "/:id/like",
  asyncRoute(async (req, res) => {
    const allowed = await visibleAuthorIds(req.uid);
    const visible = (await listStoriesForUsers(allowed)).find((st) => st.id === req.params.id);
    if (!visible) return res.status(404).json({ error: "not found" });

    const story = await toggleLike(req.params.id, req.uid);
    broadcastToUsers(await audienceForStory(story), {
      type: "story:liked",
      storyId: story.id,
      userId: story.userId,
      likeCount: story.likedByIds.length,
    });
    res.json({ story: storyFor(story, req.uid, null), liked: story.likedByIds.includes(req.uid), likeCount: story.likedByIds.length });
  })
);

router.get(
  "/:id/comments",
  asyncRoute(async (req, res) => {
    const allowed = await visibleAuthorIds(req.uid);
    const visible = (await listStoriesForUsers(allowed)).find((st) => st.id === req.params.id);
    if (!visible) return res.status(404).json({ error: "not found" });

    const comments = await listComments(req.params.id);
    const authors = await Promise.all([...new Set(comments.map((c) => c.userId))].map((id) => getUser(id)));
    const byId = new Map(authors.filter(Boolean).map((u) => [u.id, publicUser(u)]));
    res.json({ comments: comments.map((c) => ({ ...c, author: byId.get(c.userId) ?? null })) });
  })
);

router.post(
  "/:id/comments",
  asyncRoute(async (req, res) => {
    const allowed = await visibleAuthorIds(req.uid);
    const visible = (await listStoriesForUsers(allowed)).find((st) => st.id === req.params.id);
    if (!visible) return res.status(404).json({ error: "not found" });

    const text = String(req.body?.text ?? "").trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: "empty comment" });

    let parentId = null;
    if (req.body?.parentId) {
      const parent = await getComment(String(req.body.parentId));
      if (parent && parent.storyId === req.params.id) parentId = parent.parentId ?? parent.id;
    }

    const comment = await addComment({
      id: `stc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      storyId: req.params.id,
      userId: req.uid,
      text,
      createdAt: new Date().toISOString(),
      parentId,
    });
    const author = publicUser(await getUser(req.uid));
    broadcastToUsers(await audienceForStory(visible), {
      type: "story:commented",
      storyId: req.params.id,
      comment: { ...comment, author },
    });
    res.json({ comment: { ...comment, author } });
  })
);

router.post(
  "/:id/comments/:commentId/like",
  asyncRoute(async (req, res) => {
    const allowed = await visibleAuthorIds(req.uid);
    const visible = (await listStoriesForUsers(allowed)).find((st) => st.id === req.params.id);
    if (!visible) return res.status(404).json({ error: "not found" });
    const existing = await getComment(req.params.commentId);
    if (!existing || existing.storyId !== req.params.id) return res.status(404).json({ error: "not found" });

    const comment = await toggleCommentLike(req.params.commentId, req.uid);
    broadcastToUsers(await audienceForStory(visible), {
      type: "story:comment-liked",
      storyId: req.params.id,
      commentId: comment.id,
      likeCount: comment.likeCount,
      likedByIds: comment.likedByIds,
    });
    res.json({ comment, liked: comment.likedByIds.includes(req.uid), likeCount: comment.likeCount });
  })
);

async function loadStoryComment(req, res) {
  const story = await getStoryById(req.params.id);
  const comment = story ? await getComment(req.params.commentId) : null;
  if (!story || !comment || comment.storyId !== story.id) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  return { story, comment };
}

router.patch(
  "/:id/comments/:commentId",
  asyncRoute(async (req, res) => {
    const found = await loadStoryComment(req, res);
    if (!found) return;
    if (found.comment.userId !== req.uid) return res.status(403).json({ error: "Править можно только свой комментарий" });
    const text = String(req.body?.text ?? "").trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: "empty comment" });

    const comment = await editComment(found.comment.id, text);
    const author = publicUser(await getUser(req.uid));
    broadcastToUsers(await audienceForStory(found.story), {
      type: "story:comment-updated",
      storyId: found.story.id,
      comment: { ...comment, author },
    });
    res.json({ comment: { ...comment, author } });
  })
);

router.delete(
  "/:id/comments/:commentId",
  asyncRoute(async (req, res) => {
    const found = await loadStoryComment(req, res);
    if (!found) return;
    const { story, comment } = found;
    let allowed = comment.userId === req.uid;
    if (!allowed && isChannelId(story.userId)) allowed = isChannelStaff(await getChat(story.userId), req.uid);
    else if (!allowed) allowed = story.userId === req.uid;
    if (!allowed) allowed = hasAdminSection(await getUser(req.uid), "moderation");
    if (!allowed) return res.status(403).json({ error: "Недостаточно прав" });

    await deleteComment(comment.id);
    broadcastToUsers(await audienceForStory(story), {
      type: "story:comment-deleted",
      storyId: story.id,
      commentId: comment.id,
    });
    res.json({ ok: true });
  })
);

router.get(
  "/:id/viewers",
  asyncRoute(async (req, res) => {
    const story = await getStoryById(req.params.id);
    if (!story) return res.status(404).json({ error: "not found" });
    if (isChannelId(story.userId)) {
      const chat = await getChat(story.userId);
      if (!chat || !isChannelStaff(chat, req.uid)) return res.status(403).json({ error: "Недостаточно прав" });
    } else if (story.userId !== req.uid) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    const users = await Promise.all(story.viewedByIds.filter((id) => id !== req.uid).map((id) => getUser(id)));
    res.json({ viewers: users.filter(Boolean).map(publicUser) });
  })
);

router.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const story = await getStoryById(req.params.id);
    if (!story) return res.status(404).json({ error: "not found" });

    let audience;
    let byModerator = false;
    const moderator = async () => hasAdminSection(await getUser(req.uid), "moderation");
    if (isChannelId(story.userId)) {
      const chat = await getChat(story.userId);
      if (!chat) return res.status(404).json({ error: "not found" });
      if (!isChannelStaff(chat, req.uid)) {
        if (!(await moderator())) return res.status(403).json({ error: "Недостаточно прав" });
        byModerator = true;
      }
      audience = chat.memberIds;
    } else if (story.userId !== req.uid) {
      if (!(await moderator())) return res.status(403).json({ error: "Недостаточно прав" });
      byModerator = true;
      audience = [...new Set([story.userId, req.uid, ...audienceOf(story.userId)])];
    } else {
      audience = audienceOf(req.uid);
    }

    const ok = await deleteStory(req.params.id, story.userId);
    if (!ok) return res.status(404).json({ error: "not found" });
    broadcastToUsers(audience, { type: "story:deleted", storyId: req.params.id, userId: story.userId });
    if (byModerator) {
      const chat = isChannelId(story.userId) ? await getChat(story.userId) : null;
      const authorId = chat ? chat.ownerId : story.userId;
      if (authorId) {
        const dm = await findOrCreateDm(SYSTEM_BOT_ID, authorId);
        await sendMessageAndBroadcast(
          dm,
          SYSTEM_BOT_ID,
          chat
            ? `🛡 История канала «${chat.title}» удалена модерацией Shalter за нарушение правил.`
            : "🛡 Ваша история удалена модерацией Shalter за нарушение правил."
        );
      }
    }
    res.json({ ok: true });
  })
);

module.exports = router;
