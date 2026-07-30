// Downscales an uploaded photo client-side before it's stored inline as a
// data URL (no object storage in this app) — keeps the JSON store from bloating.
export function fileToImageDataUrl(file, maxSize = 256) {
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
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const fileToAvatarDataUrl = (file) => fileToImageDataUrl(file, 256);

// Plain read-as-data-URL, no re-encoding — used for videos and generic files
// where client-side transcoding isn't practical.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
