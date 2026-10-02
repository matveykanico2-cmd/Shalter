const FREE_SLOTS = 1;
const PREMIUM_SLOTS = 5;

function slotsFor(user) {
  return user?.isPremium ? PREMIUM_SLOTS : FREE_SLOTS;
}

const MAX_IMAGE_BYTES = 80 * 1024;
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function validateImage(raw) {
  const image = String(raw ?? "");
  if (!IMAGE_RE.test(image)) return { error: "Некорректное изображение" };
  if (image.length > MAX_IMAGE_BYTES) return { error: "Картинка слишком большая" };
  return { image };
}

module.exports = { FREE_SLOTS, PREMIUM_SLOTS, slotsFor, validateImage, MAX_IMAGE_BYTES };
