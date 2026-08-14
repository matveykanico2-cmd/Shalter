// Per-kind upload ceilings, in bytes. This module is the authority; the client
// mirrors these numbers in public/js/lib/uploadLimits.js purely so it can refuse
// an oversized file instantly instead of pushing gigabytes up only to be told no.
//
// These are only meaningful because uploads stream to disk (routes/uploads.js).
// Attachments used to be base64 data: URLs carried inside the message JSON,
// which capped everything at express.json's 25MB — and even that was optimistic,
// since base64 inflates by ~33%, the whole body was buffered in memory, and the
// result went into a SQLite TEXT column (SQLITE_MAX_LENGTH defaults to 1e9
// bytes). A 2GB video down that path could not have worked at any limit setting.
const MB = 1024 * 1024;
const GB = 1024 * MB;

const UPLOAD_LIMITS = {
  video: 2 * GB,
  image: 1 * GB,
  file: 500 * MB,
  voice: 1 * GB,
  "video-note": 1 * GB,
  // Profile photos and video avatars. Far tighter than the message kinds
  // above on purpose: an avatar is fetched by everyone who opens the profile,
  // it is never the point of the upload the way a shared 2GB video is, and
  // without a separate kind a "photo" avatar would inherit the 1GB image
  // ceiling.
  avatar: 20 * MB,
  "avatar-video": 60 * MB,
};
const DEFAULT_LIMIT = 1 * GB;

// Kinds that may be uploaded at all — the sanitizer's other kinds (location,
// contact, poll) are pure JSON metadata with no file behind them.
const UPLOADABLE_KINDS = new Set(Object.keys(UPLOAD_LIMITS));

function limitFor(kind) {
  return UPLOAD_LIMITS[kind] ?? DEFAULT_LIMIT;
}

// "2 ГБ" / "500 МБ" — used in the error the client shows, so the message names
// the actual ceiling rather than a byte count nobody can read at a glance.
function formatLimit(bytes) {
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} ГБ`;
  }
  return `${Math.round(bytes / MB)} МБ`;
}

const KIND_LABEL = {
  video: "Видео",
  image: "Фото",
  file: "Файл",
  voice: "Голосовое сообщение",
  "video-note": "Видео-кружок",
  avatar: "Фото профиля",
  "avatar-video": "Видео-аватар",
};

function tooLargeError(kind) {
  const label = KIND_LABEL[kind] ?? "Файл";
  return `${label} слишком большой — максимум ${formatLimit(limitFor(kind))}`;
}

module.exports = { UPLOAD_LIMITS, DEFAULT_LIMIT, UPLOADABLE_KINDS, limitFor, formatLimit, tooLargeError, KIND_LABEL };
