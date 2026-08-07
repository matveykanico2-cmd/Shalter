const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getSettings, updateSettings } = require("../data/settings");
const { listChatsForUser } = require("../data/chats");
const { listMessages } = require("../data/messages");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const settings = await getSettings(req.uid);
    res.json({ settings });
  })
);

// Real numbers for Settings → Данные и память (public/js/views/settings/
// index.js's renderData) — this app has no separate device cache to measure
// (see AGENTS.md: attachments are JSON TEXT columns on the message row
// itself, not files on disk/CDN), so "storage used" here means exactly what
// it says: the actual bytes of attachment data sitting in this account's own
// chat history, bucketed the same way Telegram's own screen does.
const BUCKET_BY_KIND = { image: "photos", video: "videos", "video-note": "videos", file: "files", voice: "voice" };

function estimateAttachmentBytes(a) {
  if (Number.isFinite(a.size)) return a.size;
  // No explicit size (composer.js doesn't set one for images) — the
  // attachment's own data: URL is the only source of truth left, and
  // base64 encodes 3 raw bytes as 4 characters.
  if (typeof a.url === "string" && a.url.startsWith("data:")) {
    const comma = a.url.indexOf(",");
    if (comma === -1) return 0;
    return Math.floor(((a.url.length - comma - 1) * 3) / 4);
  }
  return 0;
}

router.get(
  "/storage",
  asyncRoute(async (req, res) => {
    const chats = await listChatsForUser(req.uid);
    const bytesByBucket = { photos: 0, videos: 0, files: 0, voice: 0 };
    for (const chat of chats) {
      const messages = await listMessages(chat.id, req.uid);
      for (const m of messages) {
        for (const a of m.attachments ?? []) {
          const bucket = BUCKET_BY_KIND[a.kind];
          if (bucket) bytesByBucket[bucket] += estimateAttachmentBytes(a);
        }
      }
    }
    res.json({ bytesByBucket });
  })
);

router.patch(
  "/",
  asyncRoute(async (req, res) => {
    const settings = await updateSettings(req.uid, req.body ?? {});
    res.json({ settings });
  })
);

module.exports = router;
