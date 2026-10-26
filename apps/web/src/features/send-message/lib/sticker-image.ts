// Картинка для стикерпака — как prepareStickerImage (public/js/lib/image.js): GIF и
// анимированный WebP — как есть (до 3 МБ), остальное — до 512 px, WebP или PNG с прозрачностью.
const STICKER_SIDE = 512;
const STICKER_GIF_MAX = 3 * 1024 * 1024;

let webpSupported: boolean | null = null;
function supportsWebp() {
  if (webpSupported === null) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      webpSupported = c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      webpSupported = false;
    }
  }
  return webpSupported;
}

async function isAnimatedWebp(file: File) {
  try {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    return String.fromCharCode(...head).includes("ANIM");
  } catch {
    return false;
  }
}

export async function prepareStickerImage(file: File): Promise<{ file: File; animated: boolean }> {
  const type = file.type || "";
  if (type === "image/gif" || (type === "image/webp" && (await isAnimatedWebp(file)))) {
    if (file.size > STICKER_GIF_MAX) throw new Error("GIF больше 3 МБ — возьмите покороче или поменьше");
    return { file, animated: true };
  }
  if (!type.startsWith("image/")) throw new Error("Это не картинка");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Не удалось открыть картинку");
  }
  try {
    const scale = Math.min(1, STICKER_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
    const mime = supportsWebp() ? "image/webp" : "image/png";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.9));
    if (!blob) throw new Error("Не удалось подготовить картинку");
    const name = (file.name || "sticker").replace(/\.[^.]+$/, "") + (mime === "image/webp" ? ".webp" : ".png");
    return { file: new File([blob], name, { type: mime }), animated: false };
  } finally {
    bitmap.close();
  }
}
