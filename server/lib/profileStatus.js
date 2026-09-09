// Limits and validation shared between the catalog admin routes and the
// per-account wardrobe routes (server/routes/profileStatus.js, admin.js).

// Regular accounts get one status slot; Premium gets five — the same "1 vs 5"
// spread the feature was asked for in, so it lives in one place both routes
// read rather than as a magic number in each.
const FREE_SLOTS = 1;
const PREMIUM_SLOTS = 5;

function slotsFor(user) {
  return user?.isPremium ? PREMIUM_SLOTS : FREE_SLOTS;
}

// A status icon is tiny and shown next to every name it's equipped on, so it
// stays small on purpose — same idea as the avatar poster cap in lib/avatars.js,
// just tighter, since this never needs to be more than an icon.
const MAX_IMAGE_BYTES = 80 * 1024;
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

// Returns { image } or { error }. Only a data: URL the client itself produced
// (see public/js/lib/image.js) is accepted — never a remote URL, which would
// turn every profile view into a request to somebody else's host.
function validateImage(raw) {
  const image = String(raw ?? "");
  if (!IMAGE_RE.test(image)) return { error: "Некорректное изображение" };
  if (image.length > MAX_IMAGE_BYTES) return { error: "Картинка слишком большая" };
  return { image };
}

module.exports = { FREE_SLOTS, PREMIUM_SLOTS, slotsFor, validateImage, MAX_IMAGE_BYTES };
