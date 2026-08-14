// A profile's avatars: a list rather than the single image it used to be, so
// someone can keep several photos (and video avatars) and flip through them.
//
// Shape of one entry:
//   { url: "/uploads/xxx.jpg", kind: "image" | "video", poster: "data:image/…" }
//
// `url` points at a file uploaded through routes/uploads.js. `poster` is the
// small still the app shows in every avatar circle — for an image it's a
// downscaled copy, for a video it's a captured frame. The first entry is the
// current avatar.
//
// The `avatarImage` column stays exactly what it was: the current avatar's
// still, as a data URL. Every existing consumer — chat list rows, message
// senders, push notifications, data exports, the contact picker — keeps reading
// that one field and needs no changes at all. Only the viewer and the profile
// screens know about the list.

const MAX_AVATARS = 6;
// A 256px JPEG still lands around 20–40 KB as base64; this leaves generous room
// without letting a crafted request park megabytes in a TEXT column that ships
// with every user object.
const MAX_POSTER_BYTES = 400 * 1024;

const UPLOAD_URL_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;
const POSTER_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// Returns { entry } or { error }. Rejects anything that isn't a file this
// server itself stored: a remote URL here would turn every profile view into a
// request to somebody else's host (an IP-address leak for every viewer, and a
// tracking pixel for whoever hosts it).
function validateEntry(raw) {
  const url = String(raw?.url ?? "");
  if (!UPLOAD_URL_RE.test(url)) return { error: "Некорректная ссылка на файл" };

  const kind = raw?.kind === "video" ? "video" : "image";

  const poster = String(raw?.poster ?? "");
  if (!poster) return { error: "Нет превью для аватарки" };
  if (!POSTER_RE.test(poster)) return { error: "Некорректное превью" };
  if (poster.length > MAX_POSTER_BYTES) return { error: "Превью слишком большое" };

  return { entry: { url, kind, poster } };
}

function parseList(json) {
  try {
    const list = JSON.parse(json || "[]");
    return Array.isArray(list) ? list.filter((e) => e && typeof e.url === "string") : [];
  } catch {
    return [];
  }
}

// The still that goes into the `avatarImage` column: the current (first)
// avatar's poster, or null when the list is empty — which is what "no photo,
// fall back to coloured initials" has always meant.
function mainImage(list) {
  return list[0]?.poster ?? null;
}

module.exports = { MAX_AVATARS, validateEntry, parseList, mainImage };
