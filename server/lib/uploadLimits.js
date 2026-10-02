const MB = 1024 * 1024;
const GB = 1024 * MB;

const UPLOAD_LIMITS = {
  video: 5 * GB,
  image: 5 * GB,
  file: 5 * GB,
  voice: 5 * GB,
  "video-note": 5 * GB,
  avatar: 20 * MB,
  "avatar-video": 3 * GB,
  gift: 20 * MB,
  "profile-track": 5 * GB,
};
const DEFAULT_LIMIT = 1 * GB;

const UPLOADABLE_KINDS = new Set(Object.keys(UPLOAD_LIMITS));

function limitFor(kind) {
  return UPLOAD_LIMITS[kind] ?? DEFAULT_LIMIT;
}

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
  gift: "Гифка подарка",
  "profile-track": "Трек профиля",
};

function tooLargeError(kind) {
  const label = KIND_LABEL[kind] ?? "Файл";
  return `${label} слишком большой — максимум ${formatLimit(limitFor(kind))}`;
}

module.exports = { UPLOAD_LIMITS, DEFAULT_LIMIT, UPLOADABLE_KINDS, limitFor, formatLimit, tooLargeError, KIND_LABEL };
