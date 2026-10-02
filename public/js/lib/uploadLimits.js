const MB = 1024 * 1024;
const GB = 1024 * MB;

export const UPLOAD_LIMITS = {
  video: 5 * GB,
  image: 5 * GB,
  file: 5 * GB,
  voice: 5 * GB,
  "video-note": 5 * GB,
  avatar: 1 * GB,
  "avatar-video": 3 * GB,
  gift: 700 * MB,
  "profile-track": 5 * GB,
};
const DEFAULT_LIMIT = 1 * GB;

export function limitFor(kind) {
  return UPLOAD_LIMITS[kind] ?? DEFAULT_LIMIT;
}

export function formatLimit(bytes) {
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} ГБ`;
  }
  return `${Math.round(bytes / MB)} МБ`;
}

export function formatSize(bytes) {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} ГБ`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
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

export function checkSize(file, kind) {
  const limit = limitFor(kind);
  if (file.size <= limit) return null;
  return `${KIND_LABEL[kind] ?? "Файл"} слишком большой: ${formatSize(file.size)} из максимальных ${formatLimit(limit)}`;
}
