import { fileToImageDataUrl } from "@/shared/lib/image";

let webp: boolean | null = null;
function supportsWebp() {
  if (webp !== null) return webp;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webp = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webp = false;
  }
  return webp;
}

/** Фото, уменьшенное до maxSize по большей стороне, — файл для загрузки (fileToImageUpload в public/js/lib/image.js). */
export async function fileToImageUpload(file: File, maxSize: number) {
  const asWebp = supportsWebp();
  const dataUrl = await fileToImageDataUrl(file, maxSize, asWebp ? "image/webp" : "image/jpeg", 0.85);
  const blob = await (await fetch(dataUrl)).blob();
  const name = (file.name || "photo").replace(/\.[^.]+$/, "") + (asWebp ? ".webp" : ".jpg");
  return new File([blob], name, { type: asWebp ? "image/webp" : "image/jpeg" });
}
