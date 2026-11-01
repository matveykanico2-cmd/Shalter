// Фото перед отправкой — как в Telegram: не больше 2560 px по длинной стороне, JPEG ~0,87.
// Снимок с телефона (5–10 МБ) грузился целиком, хотя в ленте показывается превью;
// сжатое — в разы меньше и уходит за секунды. «Без сжатия» (файлом) — оригинал.
const MAX_SIDE = 2560;
const QUALITY = 0.87;
/** Меньше этого и не больше MAX_SIDE — отправляем как есть. */
const SMALL_BYTES = 1024 * 1024;
const COMPRESSIBLE = /^image\/(jpeg|png|webp|heic|heif|avif|bmp)$/;

export async function compressPhoto(file: File): Promise<File> {
  if (!COMPRESSIBLE.test(file.type) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // браузер не умеет этот формат — сервер разберётся с оригиналом
  }
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    if (scale === 1 && file.size <= SMALL_BYTES) return file;
    // PNG/WebP с прозрачностью в JPEG станет с чёрным фоном — такие не трогаем, если не огромные.
    if (file.type !== "image/jpeg" && scale === 1 && hasAlpha(bitmap)) return file;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

/** Есть ли прозрачные пиксели (проверяем уменьшенную копию). */
function hasAlpha(bitmap: ImageBitmap) {
  const side = 64;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  ctx.drawImage(bitmap, 0, 0, side, side);
  const data = ctx.getImageData(0, 0, side, side).data;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 255) < 255) return true;
  return false;
}
