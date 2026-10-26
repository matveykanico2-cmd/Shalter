/** Кадр видео (data URL) — постер видео-аватара, как videoPosterDataUrl в public/js/lib/image.js. */
export function videoPosterDataUrl(file: File, maxSize = 256) {
  return new Promise<string>((resolve, reject) => {
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

/** Длительность видео в секундах (0 — не удалось узнать). */
export function videoDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration || 0);
    };
    v.onerror = () => resolve(0);
    v.src = url;
  });
}
