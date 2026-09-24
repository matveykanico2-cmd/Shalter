const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getSettings, updateSettings } = require("../data/settings");
const { normalizePrivacy } = require("../lib/privacyRules");
const { isUnsupportedLanguage, UNSUPPORTED_MESSAGE } = require("../lib/unsupportedLanguages");
const { listChatsForUser } = require("../data/chats");
const { attachmentBytesByKind } = require("../data/messages");
const { BUILTIN_HOLIDAYS } = require("../lib/holidays");
const { getUser } = require("../data/users");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const settings = await getSettings(req.uid);
    // Встроенный список праздников (lib/holidays.js) — статичный каталог,
    // тот же принцип, что и у /api/labels: правится в коде, читают все.
    res.json({ settings, holidayCatalog: BUILTIN_HOLIDAYS });
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
    // Суммы считает база (см. attachmentBytesByKind): раньше сюда выгружалась
    // вся переписка человека целиком, вместе с вложениями, ради четырёх чисел.
    const byKind = attachmentBytesByKind(chats.map((c) => c.id));
    for (const [kind, bytes] of Object.entries(byKind)) {
      const bucket = BUCKET_BY_KIND[kind];
      if (bucket) bytesByBucket[bucket] += bytes;
    }
    res.json({ bytesByBucket });
  })
);

// MM-DD, год не хранится — тот же формат, что и у users.birthday (см.
// listUsersWithBirthdayToday), только это своя дата на каждый праздник.
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
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
      return {
        id: typeof h.id === "string" && h.id ? h.id : `hol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        date,
      };
    })
    .filter(Boolean);
  return { disabled, custom };
}

// Shalter для бизнеса — часы работы, приветствие/автоответ, быстрые ответы
// (server/routes/business.js для самой подписки, lib/businessAutoReply.js
// для доставки). `enabled` принудительно false для аккаунта без активной
// подписки — иначе истёкшая или никогда не купленная подписка продолжала бы
// работать, если человек когда-то успел включить переключатель.
const { DAY_KEYS, isValidTimeZone } = require("../lib/businessHours");
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Конец дня может быть 24:00 — «до полуночи», а вместе с 00:00 —
// «круглосуточно» (lib/businessHours.js). Начало — нет.
const CLOSE_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

function sanitizeHours(raw) {
  const out = {};
  for (const day of DAY_KEYS) {
    const d = raw?.[day] ?? {};
    out[day] = {
      closed: !!d.closed,
      open: TIME_RE.test(d.open) ? d.open : "09:00",
      close: CLOSE_RE.test(d.close) ? d.close : "18:00",
    };
  }
  return out;
}

function sanitizeQuickReplies(raw) {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 50)
    .map((q) => {
      const text = String(q?.text ?? "").trim().slice(0, 1000);
      if (!text) return null;
      return {
        id: typeof q?.id === "string" && q.id ? q.id : `qr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        shortcut: String(q?.shortcut ?? "").trim().slice(0, 32),
        text,
      };
    })
    .filter(Boolean);
}

async function sanitizeBusiness(raw, userId) {
  const me = await getUser(userId);
  return {
    enabled: !!raw?.enabled && !!me?.isBusiness,
    hours: sanitizeHours(raw?.hours),
    // Часовой пояс бизнеса (IANA, «Europe/Moscow»): по нему считаются часы
    // работы и автоответ. null — пояс сервера, как у старых настроек.
    timeZone: isValidTimeZone(raw?.timeZone) ? raw.timeZone : null,
    // Показывать ли часы работы в профиле («Открыто · до 18:00»), как в
    // Telegram Business. По умолчанию да.
    showHours: raw?.showHours !== false,
    greeting: { enabled: !!raw?.greeting?.enabled, text: String(raw?.greeting?.text ?? "").trim().slice(0, 500) },
    away: { enabled: !!raw?.away?.enabled, text: String(raw?.away?.text ?? "").trim().slice(0, 500) },
    quickReplies: sanitizeQuickReplies(raw?.quickReplies),
  };
}

router.patch(
  "/",
  asyncRoute(async (req, res) => {
    const patch = { ...(req.body ?? {}) };
    // Единственная часть настроек, которую нельзя принимать как есть: списки
    // исключений решают, кому видно номер телефона и последний визит, а сюда
    // приходит любой JSON, какой клиент пришлёт. Приводим к ожидаемой форме —
    // строки, без повторов, с ограничением по длине (см. lib/privacyRules.js).
    if (patch.privacy) patch.privacy = normalizePrivacy(patch.privacy);
    if (patch.holidays) patch.holidays = sanitizeHolidays(patch.holidays);
    if (patch.business) patch.business = await sanitizeBusiness(patch.business, req.uid);
    // Язык, которого в мессенджере нет, нельзя и сохранить: убрать его из
    // выпадающего списка мало — настройки патчатся обычным запросом, а записанный
    // однажды язык интерфейса применяется при каждом заходе.
    if (isUnsupportedLanguage(patch.uiLanguage) || isUnsupportedLanguage(patch.translateLanguage)) {
      return res.status(400).json({ error: UNSUPPORTED_MESSAGE });
    }
    const settings = await updateSettings(req.uid, patch);
    res.json({ settings });
  })
);

module.exports = router;
