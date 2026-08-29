// Attachments arrive as client-authored JSON (composer.js builds them
// client-side — a photo becomes a data: URL, a location becomes {lat,lng},
// etc.) and go straight into a broadcast message with no other checkpoint —
// unlike message *text* (see public/js/lib/formatText.js, which never uses
// innerHTML), an attachment's `url` lands directly in a real `<a href>`
// (FileAttachment in messageBubble.js), so an unvalidated `javascript:` URL
// there would execute in the *recipient's* browser on click, not just the
// sender's — a real stored-XSS path, not merely a sender self-XSS one.
// This is the one place that needs to hold the line, since nothing else
// downstream re-checks it.
const ALLOWED_KINDS = new Set(["image", "video", "voice", "video-note", "file", "location", "contact", "poll"]);
const MAX_ATTACHMENTS = 10;

// "/uploads/<id>[.ext]" — a file this server itself stored (routes/uploads.js).
// Matched exactly rather than by prefix so "/uploads/../../etc/passwd" or a
// "//evil.example/x" protocol-relative URL can't ride in as one.
const UPLOAD_URL_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;

function isSafeUrl(url) {
  if (typeof url !== "string") return false;
  // data: is still accepted for the small inline cases that legitimately use it
  // (voice notes, video circles) and for messages sent before uploads existed.
  return UPLOAD_URL_RE.test(url) || url.startsWith("data:") || url.startsWith("https://") || url.startsWith("http://");
}

// Returns a cleaned array (never throws) — attachments that don't pass are
// dropped rather than failing the whole message, since a partially-broken
// attachment array from a buggy client is more useful recovered than 400'd.
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
      if (a.name !== undefined) out.name = String(a.name).slice(0, 300);
      if (a.mimeType !== undefined) out.mimeType = String(a.mimeType).slice(0, 120);
      if (a.size !== undefined) out.size = Number.isFinite(a.size) ? a.size : undefined;
      if (a.kind === "location") {
        const lat = Number(a.meta?.lat);
        const lng = Number(a.meta?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        out.meta = { lat, lng };
      } else if (a.kind === "contact") {
        out.meta = {
          userId: typeof a.meta?.userId === "string" ? a.meta.userId : undefined,
          name: typeof a.meta?.name === "string" ? a.meta.name.slice(0, 200) : undefined,
          phone: typeof a.meta?.phone === "string" ? a.meta.phone.slice(0, 40) : undefined,
        };
      } else if (a.kind === "poll") {
        // Раньше здесь meta бралась как есть — с расчётом на то, что её проверит
        // обработчик голосования. Он проверяет голоса, но не саму структуру:
        // клиент мог прислать что угодно, и это легло бы в базу. Теперь опрос
        // собирается заново из того, что в нём вообще может быть.
        const options = (Array.isArray(a.meta?.options) ? a.meta.options : [])
          .slice(0, 8)
          .map((o) => String(o).slice(0, 200));
        if (options.length < 2) return null;
        const voterIds = options.map((_, i) =>
          (Array.isArray(a.meta?.voterIds?.[i]) ? a.meta.voterIds[i] : []).filter((v) => typeof v === "string").slice(0, 5000)
        );
        // Правильный ответ викторины: номер варианта или null у обычного опроса.
        // Проверяется тип, а не Number(): Number(null) — это ноль, и обычный
        // опрос с correctIndex: null (а именно так его шлёт composer.js)
        // превращался в викторину, где «правильным» оказывался первый вариант.
        const rawCorrect = a.meta?.correctIndex;
        const correctIndex =
          typeof rawCorrect === "number" && Number.isInteger(rawCorrect) && rawCorrect >= 0 && rawCorrect < options.length
            ? rawCorrect
            : null;
        out.meta = { options, voterIds, votes: voterIds.map((v) => v.length), correctIndex };
      }
      return out;
    })
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

module.exports = { sanitizeAttachments, isSafeUrl };
