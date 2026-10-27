// Сборка картинки истории из фона и слоёв редактора (bake в public/js/components/storyEditor.js):
// 1080×1920, фон «cover», слои — в долях кадра, с поворотом и масштабом.

export const EXPORT_W = 1080;
export const EXPORT_H = 1920;

export type Layer = {
  id: number;
  type: "text" | "emoji" | "image";
  /** Текст или эмодзи. */
  text?: string;
  img?: HTMLImageElement;
  /** Высота / ширина картинки-слоя. */
  ratio?: number;
  /** Центр слоя в долях кадра. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
  /** Подложка под текстом. */
  bg: boolean;
};

/** Размер шрифта — доля высоты кадра, ширина картинки-слоя — доля ширины. */
export const baseFontFraction = (type: Layer["type"]) => (type === "emoji" ? 0.12 : 0.055);
export const IMAGE_WIDTH_FRACTION = 0.4;

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить картинку"));
    img.src = src;
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, w: number, h: number) {
  // Текстовая история — белый холст без фото.
  if (!img) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const ir = img.naturalWidth / img.naturalHeight || 1;
  const cr = w / h;
  let sx, sy, sw, sh;
  if (ir > cr) {
    sh = img.naturalHeight;
    sw = sh * cr;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    sw = img.naturalWidth;
    sh = sw / cr;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

/** JPEG 1080×1920 с наложенными слоями; без фона — на белом. */
export async function bakeStory(bg: HTMLImageElement | null, layers: readonly Layer[]): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_W;
  canvas.height = EXPORT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  drawCover(ctx, bg, EXPORT_W, EXPORT_H);

  for (const layer of layers) {
    ctx.save();
    ctx.translate(layer.x * EXPORT_W, layer.y * EXPORT_H);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.scale(layer.scale, layer.scale);
    if (layer.type === "image" && layer.img) {
      const w = IMAGE_WIDTH_FRACTION * EXPORT_W;
      const h = w * (layer.ratio ?? 1);
      ctx.drawImage(layer.img, -w / 2, -h / 2, w, h);
    } else if (layer.text) {
      const fontSize = baseFontFraction(layer.type) * EXPORT_H;
      ctx.font = `${layer.type === "text" ? "700 " : ""}${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (layer.type === "text" && layer.bg) {
        const padX = fontSize * 0.35;
        const padY = fontSize * 0.28;
        const w = ctx.measureText(layer.text).width + padX * 2;
        const h = fontSize + padY * 2;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2);
        ctx.fill();
      }
      ctx.fillStyle = layer.type === "emoji" ? "#000" : layer.color;
      ctx.fillText(layer.text, 0, 0);
    }
    ctx.restore();
  }

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
  if (!blob) throw new Error("empty canvas");
  return new File([blob], "story.jpg", { type: "image/jpeg" });
}
