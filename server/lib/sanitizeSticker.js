// A sent sticker used to go straight from the request body into the stored
// message. That was tolerable while the only stickers were a fixed list in the
// client; with user-made packs (server/data/stickerPacks.js) the payload is
// genuinely user-authored, so it gets pinned to a known shape here — the same
// treatment attachments already get in lib/sanitizeAttachments.js.
//
// `anim` and `scene` end up as CSS class names on the rendered element, so they
// are restricted to plain identifiers rather than passed through.
const NAME_RE = /^[a-z0-9_-]{1,32}$/;

function sanitizeSticker(sticker) {
  if (!sticker || typeof sticker !== "object") return undefined;
  const emoji = String(sticker.emoji ?? "").trim().slice(0, 8);
  if (!emoji) return undefined;
  return {
    emoji,
    name: String(sticker.name ?? "").trim().slice(0, 40),
    ...(typeof sticker.anim === "string" && NAME_RE.test(sticker.anim) ? { anim: sticker.anim } : {}),
    ...(typeof sticker.scene === "string" && NAME_RE.test(sticker.scene) ? { scene: sticker.scene } : {}),
  };
}

module.exports = { sanitizeSticker };
