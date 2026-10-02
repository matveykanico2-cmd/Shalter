const { sanitizeScene } = require("./sanitizeScene");
const NAME_RE = /^[a-z0-9_-]{1,32}$/;

const UPLOAD_URL_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;
const IMAGE_EMOJI = "🖼️";

function sanitizeSticker(sticker) {
  if (!sticker || typeof sticker !== "object") return undefined;
  const name = String(sticker.name ?? "").trim().slice(0, 40);
  if (sticker.kind === "custom") {
    const scene = sanitizeScene(sticker.scene, { requireLayers: true });
    if (!scene) return undefined;
    return {
      kind: "custom",
      scene,
      emoji: String(sticker.emoji ?? "").trim().slice(0, 8) || "🎨",
      name,
    };
  }
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
