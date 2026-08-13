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
        out.meta = a.meta; // structure/voting already validated by routes/messages.js's vote handler
      }
      return out;
    })
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

module.exports = { sanitizeAttachments, isSafeUrl };
