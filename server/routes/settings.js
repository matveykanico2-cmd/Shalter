const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getSettings, updateSettings, DEFAULT_SETTINGS } = require("../data/settings");
const { normalizePrivacy } = require("../lib/privacyRules");
const { isUnsupportedLanguage, UNSUPPORTED_MESSAGE } = require("../lib/unsupportedLanguages");
const { listChatsForUser } = require("../data/chats");
const { attachmentBytesByKind } = require("../data/messages");
const { BUILTIN_HOLIDAYS } = require("../lib/holidays");
const { getUser } = require("../data/users");
const { sanitizeAttachments } = require("../lib/sanitizeAttachments");
const { usesForeignUpload } = require("../lib/uploadAccess");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const settings = await getSettings(req.uid);
    res.json({ settings, holidayCatalog: BUILTIN_HOLIDAYS });
  })
);

const BUCKET_BY_KIND = { image: "photos", video: "videos", "video-note": "videos", file: "files", voice: "voice" };

function estimateAttachmentBytes(a) {
  if (Number.isFinite(a.size)) return a.size;
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
    const byKind = attachmentBytesByKind(chats.map((c) => c.id));
    for (const [kind, bytes] of Object.entries(byKind)) {
      const bucket = BUCKET_BY_KIND[kind];
      if (bucket) bytesByBucket[bucket] += bytes;
    }
    res.json({ bytesByBucket });
  })
);

const HOLIDAY_DATE_RE = /^\d{2}-\d{2}$/;

function sanitizeHolidays(raw) {
  const disabled = Array.isArray(raw?.disabled)
    ? [...new Set(raw.disabled.filter((id) => typeof id === "string").slice(0, 200))]
    : [];
  const custom = (Array.isArray(raw?.custom) ? raw.custom : [])
    .slice(0, 50)
    .map((h) => {
      const date = String(h?.date ?? "");
      const title = String(h?.title ?? "").trim().slice(0, 80);
      if (!HOLIDAY_DATE_RE.test(date) || !title) return null;
      const [mm, dd] = date.split("-").map(Number);
      // Число месяца — с учётом месяца; 29 февраля допустимо (високосный 2000 год).
      if (mm < 1 || mm > 12 || dd < 1 || dd > new Date(Date.UTC(2000, mm, 0)).getUTCDate()) return null;
      return {
        id: typeof h.id === "string" && h.id ? h.id : `hol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        date,
      };
    })
    .filter(Boolean);
  return { disabled, custom };
}

const { DAY_KEYS, isValidTimeZone } = require("../lib/businessHours");
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

function sanitizeHours(raw) {
  const out = {};
  for (const day of DAY_KEYS) {
    // День, которого нет в запросе, — как по умолчанию (сб и вс — выходные), а не рабочий 09–18.
    const d = raw?.[day] ?? DEFAULT_SETTINGS.business.hours[day];
    out[day] = {
      closed: !!d.closed,
      open: TIME_RE.test(d.open) ? d.open : "09:00",
      close: CLOSE_RE.test(d.close) ? d.close : "18:00",
    };
  }
  return out;
}

function sanitizeOneAttachment(raw) {
  return (sanitizeAttachments(raw) ?? []).slice(0, 1);
}

function sanitizeQuickReplies(raw) {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 50)
    .map((q) => {
      const text = String(q?.text ?? "").trim().slice(0, 1000);
      const attachments = sanitizeOneAttachment(q?.attachments);
      if (!text && !attachments.length) return null;
      return {
        id: typeof q?.id === "string" && q.id ? q.id : `qr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        shortcut: String(q?.shortcut ?? "").trim().slice(0, 32),
        text,
        attachments,
      };
    })
    .filter(Boolean);
}

async function sanitizeBusiness(raw, userId) {
  const me = await getUser(userId);
  return {
    enabled: !!raw?.enabled && !!me?.isBusiness,
    hours: sanitizeHours(raw?.hours),
    timeZone: isValidTimeZone(raw?.timeZone) ? raw.timeZone : null,
    showHours: raw?.showHours !== false,
    greeting: {
      enabled: !!raw?.greeting?.enabled,
      text: String(raw?.greeting?.text ?? "").trim().slice(0, 500),
      attachments: sanitizeOneAttachment(raw?.greeting?.attachments),
    },
    away: {
      enabled: !!raw?.away?.enabled,
      text: String(raw?.away?.text ?? "").trim().slice(0, 500),
      attachments: sanitizeOneAttachment(raw?.away?.attachments),
    },
    quickReplies: sanitizeQuickReplies(raw?.quickReplies),
  };
}

router.patch(
  "/",
  asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    if (typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "Некорректные настройки" });
    const patch = { ...body };
    const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    // privacy не объектом молча отбрасывается — прежние настройки остаются.
    if ("privacy" in patch) {
      if (isPlainObject(patch.privacy)) patch.privacy = normalizePrivacy(patch.privacy);
      else delete patch.privacy;
    }
    // notifications сливается с текущими: PATCH { sound } не стирает mutedChats и previewText.
    if ("notifications" in patch) {
      if (isPlainObject(patch.notifications)) {
        const current = (await getSettings(req.uid)).notifications;
        patch.notifications = { ...(isPlainObject(current) ? current : DEFAULT_SETTINGS.notifications), ...patch.notifications };
      } else delete patch.notifications;
    }
    // Иконка приложения (хранится в аккаунте, чтобы пережить обновление/переустановку)
    if ("appIcon" in patch && !(typeof patch.appIcon === "string" && /^[a-z0-9-]{1,32}$/.test(patch.appIcon))) delete patch.appIcon;
    if (patch.holidays) patch.holidays = sanitizeHolidays(patch.holidays);
    if (patch.business) patch.business = await sanitizeBusiness(patch.business, req.uid);
    if (isUnsupportedLanguage(patch.uiLanguage) || isUnsupportedLanguage(patch.translateLanguage)) {
      return res.status(400).json({ error: UNSUPPORTED_MESSAGE });
    }
    // Обои, вложения автоответов и т. п.: только свои или и так доступные файлы.
    if (usesForeignUpload(req.uid, patch, await getSettings(req.uid))) {
      return res.status(400).json({ error: "Некорректная ссылка на файл" });
    }
    const settings = await updateSettings(req.uid, patch);
    res.json({ settings });
  })
);

module.exports = router;
