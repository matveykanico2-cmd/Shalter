export function fileToImageDataUrl(file, maxSize = 256, mime = "image/jpeg", quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas недоступен"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const fileToAvatarDataUrl = (file) => fileToImageDataUrl(file, 256);

let webpSupported = null;
function supportsWebp() {
  if (webpSupported !== null) return webpSupported;
  try {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    webpSupported = probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

export async function fileToImageUpload(file, maxSize = 1080) {
  const webp = supportsWebp();
  const dataUrl = await fileToImageDataUrl(file, maxSize, webp ? "image/webp" : "image/jpeg", 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  const ext = webp ? ".webp" : ".jpg";
  const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ext;
  return new File([blob], name, { type: webp ? "image/webp" : "image/jpeg" });
}

const PHOTO_MAX_SIDE = 2560;
const PHOTO_SKIP_BYTES = 800 * 1024;
export async function compressPhotoForUpload(file) {
  const type = file.type || "";
  if (!type.startsWith("image/") || type === "image/gif" || type === "image/svg+xml") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const longSide = Math.max(bitmap.width, bitmap.height);
    if (file.size <= PHOTO_SKIP_BYTES && longSide <= PHOTO_MAX_SIDE) return file;
    const scale = Math.min(1, PHOTO_MAX_SIDE / longSide);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const webp = supportsWebp();
    if (!webp) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    const mime = webp ? "image/webp" : "image/jpeg";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || "photo").replace(/\.[^.]+$/, "") + (webp ? ".webp" : ".jpg");
    return new File([blob], name, { type: mime });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

async function isAnimatedWebp(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    return String.fromCharCode(...head).includes("ANIM");
  } catch {
    return false;
  }
}
const STICKER_SIDE = 512;
const STICKER_GIF_MAX = 3 * 1024 * 1024;
export async function prepareStickerImage(file) {
  const type = file.type || "";
  if (type === "image/gif" || (type === "image/webp" && (await isAnimatedWebp(file)))) {
    if (file.size > STICKER_GIF_MAX) throw new Error("GIF больше 3 МБ — возьмите покороче или поменьше");
    return { file, animated: true };
  }
  if (!type.startsWith("image/")) throw new Error("Это не картинка");
  let bitmap;
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
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const mime = supportsWebp() ? "image/webp" : "image/png";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.9));
    if (!blob) throw new Error("Не удалось подготовить картинку");
    const name = (file.name || "sticker").replace(/\.[^.]+$/, "") + (mime === "image/webp" ? ".webp" : ".png");
    return { file: new File([blob], name, { type: mime }), animated: false };
  } finally {
    bitmap.close?.();
  }
}

export function videoPosterDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    const fail = (msg) => {
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };
    video.onerror = () => fail("Не удалось прочитать видео");
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.25, (video.duration || 1) / 4);
    };
    video.onseeked = () => {
      try {
        const w0 = video.videoWidth;
        const h0 = video.videoHeight;
        if (!w0 || !h0) return fail("Видео без изображения");
        const scale = Math.min(1, maxSize / Math.max(w0, h0));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w0 * scale);
        canvas.height = Math.round(h0 * scale);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        const poster = canvas.toDataURL("image/jpeg", 0.85);
        URL.revokeObjectURL(url);
        resolve(poster);
      } catch {
        fail("Не удалось получить кадр из видео");
      }
    };
    video.src = url;
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
