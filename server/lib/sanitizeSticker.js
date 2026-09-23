// A sent sticker used to go straight from the request body into the stored
// message. That was tolerable while the only stickers were a fixed list in the
// client; with user-made packs (server/data/stickerPacks.js) the payload is
// genuinely user-authored, so it gets pinned to a known shape here — the same
// treatment attachments already get in lib/sanitizeAttachments.js.
//
// `anim` and `scene` end up as CSS class names on the rendered element, so they
// are restricted to plain identifiers rather than passed through.
const NAME_RE = /^[a-z0-9_-]{1,32}$/;

// Своя картинка вместо эмодзи (фото, PNG без фона, GIF) — только файл,
// загруженный в само приложение. Внешняя ссылка в стикере показывалась бы у
// каждого, кто его увидит, то есть работала бы как счётчик просмотров чужого
// сервера.
const UPLOAD_URL_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;
// Подпись к картинке в уведомлениях и списке чатов — там, где саму картинку
// не покажешь.
const IMAGE_EMOJI = "🖼️";

function sanitizeSticker(sticker) {
  if (!sticker || typeof sticker !== "object") return undefined;
  const name = String(sticker.name ?? "").trim().slice(0, 40);
  if (sticker.kind === "image") {
    if (typeof sticker.url !== "string" || !UPLOAD_URL_RE.test(sticker.url)) return undefined;
    return {
      kind: "image",
      url: sticker.url,
      emoji: String(sticker.emoji ?? "").trim().slice(0, 8) || IMAGE_EMOJI,
      name,
      ...(sticker.animated ? { animated: true } : {}),
    };
  }
  const emoji = String(sticker.emoji ?? "").trim().slice(0, 8);
  if (!emoji) return undefined;
  return {
    emoji,
    name,
    ...(typeof sticker.anim === "string" && NAME_RE.test(sticker.anim) ? { anim: sticker.anim } : {}),
    ...(typeof sticker.scene === "string" && NAME_RE.test(sticker.scene) ? { scene: sticker.scene } : {}),
  };
}

module.exports = { sanitizeSticker };
