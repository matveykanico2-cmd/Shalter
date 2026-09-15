// Mirror of server/lib/uploadLimits.js. The server is the authority and enforces
// these regardless of what happens here — this copy exists so the app can refuse
// an oversized file the instant it's picked, instead of spending minutes pushing
// 2GB up the wire to be told no at the end.
const MB = 1024 * 1024;
const GB = 1024 * MB;

// Единый потолок для тяжёлых медиа: оригинал уходит как есть, а лёгкое превью
// (240p-видео, уменьшенная картинка) готовит сервер после загрузки — см.
// server/lib/mediaPreview.js. В чате видно превью, оригинал качается отдельно,
// поэтому разные числа для видео/файла/картинки больше ничего не решают.
export const UPLOAD_LIMITS = {
  video: 5 * GB,
  image: 5 * GB,
  file: 5 * GB,
  voice: 5 * GB,
  "video-note": 5 * GB,
  avatar: 2 * MB,
  "avatar-video": 3 * GB,
};
const DEFAULT_LIMIT = 6 * MB;

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
