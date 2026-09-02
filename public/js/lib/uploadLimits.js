// Mirror of server/lib/uploadLimits.js. The server is the authority and enforces
// these regardless of what happens here — this copy exists so the app can refuse
// an oversized file the instant it's picked, instead of spending minutes pushing
// 2GB up the wire to be told no at the end.
const MB = 1024 * 1024;
const GB = 1024 * MB;

// Пределы посчитаны от размера диска, а не взяты «побольше, чтобы никто не
// упёрся». На 60 гигабайтах прежние значения означали, что тридцать видео
// заполняют хранилище целиком: два гигабайта на ролик — это три процента всего
// места за одну отправку.
//
// Нынешние числа — компромисс: видеосообщение с телефона обычно меньше
// трёхсот мегабайт, документ — меньше двухсот, а картинка всё равно
// пережимается перед отправкой до сотен килобайт, поэтому её предел нужен
// только чтобы отсечь заведомо неподъёмный файл до начала передачи.
export const UPLOAD_LIMITS = {
  video: 20 * MB,
  image: 25 * MB,
  file: 12 * MB,
  voice: 4 * MB,
  "video-note": 6 * MB,
  avatar: 2 * MB,
  "avatar-video": 3 * MB,
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
