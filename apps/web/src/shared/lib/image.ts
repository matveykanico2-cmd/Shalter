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
