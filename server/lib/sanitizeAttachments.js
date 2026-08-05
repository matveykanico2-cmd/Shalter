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

function isSafeUrl(url) {
  return typeof url === "string" && (url.startsWith("data:") || url.startsWith("https://") || url.startsWith("http://"));
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

module.exports = { sanitizeAttachments };
