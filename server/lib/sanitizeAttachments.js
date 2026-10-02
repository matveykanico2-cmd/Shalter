const ALLOWED_KINDS = new Set(["image", "video", "voice", "video-note", "file", "location", "contact", "poll", "checklist", "dice"]);
// Анимированные эмодзи-игры, как в Telegram: число выпадает на сервере,
// клиент присылает только какой эмодзи бросить. Значение — максимум очков.
const DICE = { "🎲": 6, "🎯": 6, "🏀": 5, "⚽": 5, "🎳": 6, "🎰": 64 };
const MAX_CHECKLIST_ITEMS = 30;
const MAX_ATTACHMENTS = 10;
const crypto = require("crypto");

const UPLOAD_URL_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;

function isSafeUrl(url) {
  if (typeof url !== "string") return false;
  return UPLOAD_URL_RE.test(url) || url.startsWith("data:") || url.startsWith("https://") || url.startsWith("http://");
}

function sanitizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return undefined;
  const cleaned = attachments
    .slice(0, MAX_ATTACHMENTS)
    .filter((a) => a && ALLOWED_KINDS.has(a?.kind))
    .map((a) => {
      const out = { kind: a.kind };
      if (a.url !== undefined) {
        if (!isSafeUrl(a.url)) return null;
        out.url = a.url;
      }
      if (a.thumbUrl !== undefined) {
        if (!isSafeUrl(a.thumbUrl)) return null;
        out.thumbUrl = a.thumbUrl;
      }
      if (a.name !== undefined) out.name = String(a.name).slice(0, 300);
      if (a.mimeType !== undefined) out.mimeType = String(a.mimeType).slice(0, 120);
      if (a.size !== undefined) out.size = Number.isFinite(a.size) ? a.size : undefined;
      if (a.kind === "voice" || a.kind === "video-note") {
        const dur = Number(a.durationSec);
        if (Number.isFinite(dur) && dur >= 0 && dur < 24 * 3600) out.durationSec = dur;
      }
      if (a.kind === "location") {
        const lat = Number(a.meta?.lat);
        const lng = Number(a.meta?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        out.meta = { lat, lng };
        const liveMinutes = Number(a.meta?.liveMinutes);
        if (Number.isFinite(liveMinutes) && liveMinutes > 0 && liveMinutes <= 8 * 60) {
          out.meta.live = true;
          out.meta.expiresAt = new Date(Date.now() + liveMinutes * 60_000).toISOString();
        }
      } else if (a.kind === "contact") {
        out.meta = {
          userId: typeof a.meta?.userId === "string" ? a.meta.userId : undefined,
          name: typeof a.meta?.name === "string" ? a.meta.name.slice(0, 200) : undefined,
          phone: typeof a.meta?.phone === "string" ? a.meta.phone.slice(0, 40) : undefined,
        };
      } else if (a.kind === "poll") {
        const options = (Array.isArray(a.meta?.options) ? a.meta.options : [])
          .slice(0, 8)
          .map((o) => String(o).slice(0, 200));
        if (options.length < 2) return null;
        const voterIds = options.map(() => []);
        const rawCorrect = a.meta?.correctIndex;
        const correctIndex =
          typeof rawCorrect === "number" && Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < options.length
            ? rawCorrect
            : null;
        const multiple = correctIndex === null && a.meta?.multiple === true;
        out.meta = { options, voterIds, votes: voterIds.map((v) => v.length), correctIndex, multiple, closed: false };
      } else if (a.kind === "dice") {
        const emoji = typeof a.meta?.emoji === "string" && DICE[a.meta.emoji] ? a.meta.emoji : "🎲";
        out.meta = { emoji, value: crypto.randomInt(1, DICE[emoji] + 1) };
      } else if (a.kind === "checklist") {
        // Чек-лист, как в Telegram: отметки ставит сервер, от клиента — только тексты.
        const items = (Array.isArray(a.meta?.items) ? a.meta.items : [])
          .map((it) => String(typeof it === "string" ? it : it?.text ?? "").trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, MAX_CHECKLIST_ITEMS)
          .map((text, i) => ({ id: i + 1, text }));
        if (!items.length) return null;
        out.meta = { items, othersCanAdd: a.meta?.othersCanAdd === true, othersCanMark: a.meta?.othersCanMark !== false };
      }
      return out;
    })
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

module.exports = { sanitizeAttachments, isSafeUrl, MAX_CHECKLIST_ITEMS, DICE };
