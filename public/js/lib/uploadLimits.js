// Mirror of server/lib/uploadLimits.js. The server is the authority and enforces
// these regardless of what happens here — this copy exists so the app can refuse
// an oversized file the instant it's picked, instead of spending minutes pushing
// 2GB up the wire to be told no at the end.
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const UPLOAD_LIMITS = {
  video: 2 * GB,
  image: 1 * GB,
  file: 500 * MB,
  voice: 1 * GB,
  "video-note": 1 * GB,
  avatar: 20 * MB,
  "avatar-video": 60 * MB,
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

// Human-readable actual file size, for the "12.4 МБ из 500 МБ" style message.
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
};

// null when the file fits; an error string naming both sizes when it doesn't.
export function checkSize(file, kind) {
  const limit = limitFor(kind);
  if (file.size <= limit) return null;
  return `${KIND_LABEL[kind] ?? "Файл"} слишком большой: ${formatSize(file.size)} из максимальных ${formatLimit(limit)}`;
}
