const MAX_AVATARS = 6;
const MAX_POSTER_BYTES = 400 * 1024;

const UPLOAD_URL_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;
const POSTER_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

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

function mainImage(list) {
  return list[0]?.poster ?? null;
}

module.exports = { MAX_AVATARS, validateEntry, parseList, mainImage };
