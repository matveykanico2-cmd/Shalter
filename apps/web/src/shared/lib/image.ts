/** Картинка из файла, уменьшенная до maxSize по большей стороне, как data URL (fileToImageDataUrl, public/js/lib/image.js). */
export function fileToImageDataUrl(file: File, maxSize = 256, mime = "image/jpeg", quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas недоступен"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Крошечная размытая миниатюра фото или кадра видео (24 px) — её видят до оплаты
 * платного поста (blurThumbFor в public/js/components/composer.js).
 */
export async function blurThumb(file: File, timeoutMs = 3000): Promise<{ blur: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const src = await new Promise<HTMLImageElement | HTMLVideoElement>((resolve, reject) => {
      // Кадр не достался (кодек, обрыв) — пост уйдёт без миниатюры, а не повиснет.
      setTimeout(() => reject(new Error("Не удалось прочитать кадр")), timeoutMs);
      if (file.type.startsWith("video/")) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.onloadeddata = () => {
          v.currentTime = Math.min(1, (v.duration || 2) / 2);
        };
        v.onseeked = () => resolve(v);
        v.onerror = reject;
        v.src = url;
      } else {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      }
    });
    const w = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
    const h = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
    const k = 24 / Math.max(w, h);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d")?.drawImage(src, 0, 0, c.width, c.height);
    return { blur: c.toDataURL("image/jpeg", 0.6), width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

let webpSupported: boolean | null = null;
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

/** Фото, уменьшенное до maxSize, файлом webp/jpeg — для загрузки (fileToImageUpload). */
export async function fileToImageUpload(file: File, maxSize = 1080) {
  const webp = supportsWebp();
  const dataUrl = await fileToImageDataUrl(file, maxSize, webp ? "image/webp" : "image/jpeg", 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  const name = (file.name || "photo").replace(/\.[^.]+$/, "") + (webp ? ".webp" : ".jpg");
  return new File([blob], name, { type: webp ? "image/webp" : "image/jpeg" });
}

/** Кадр из начала видео как data URL jpeg — обложка видеоаватара (videoPosterDataUrl). */
export function videoPosterDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    const fail = (msg: string) => {
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };
    video.onerror = () => fail("Не удалось прочитать видео");
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.25, (video.duration || 1) / 4);
    };
    video.onseeked = () => {
      const w0 = video.videoWidth;
      const h0 = video.videoHeight;
      if (!w0 || !h0) return fail("Видео без изображения");
      const scale = Math.min(1, maxSize / Math.max(w0, h0));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w0 * scale);
      canvas.height = Math.round(h0 * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return fail("Не удалось получить кадр из видео");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    video.src = url;
  });
}

/** Длительность аудио или видео из файла в секундах; не узнали за 5 с — undefined. */
export function mediaDuration(file: File, tag: "audio" | "video" = "audio"): Promise<number | undefined> {
  return new Promise((resolve) => {
    const probe = document.createElement(tag);
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (v: number | undefined) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(v);
    };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => finish(Number.isFinite(probe.duration) ? probe.duration : undefined);
    probe.onerror = () => finish(undefined);
    setTimeout(() => finish(undefined), 5000);
    probe.src = url;
  });
}
