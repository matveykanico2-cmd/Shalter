import { emojiImageUrl } from "@/shared/lib/emoji-images";

export type Layer = {
  id: string;
  kind: "emoji" | "sticker" | "photo";
  /** Эмодзи-символ или ссылка на картинку. */
  src: string;
  /** Центр слоя, доля стороны квадрата 0..1. */
  x: number;
  y: number;
  /** Размер слоя, доля стороны квадрата. */
  scale: number;
};

export type Background = { id: string; css: string; stops: readonly string[] };

export const BACKGROUNDS: readonly Background[] = [
  ...["#e17076", "#faa774", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae", "#f2c94c", "#2b2d42", "#ffffff"].map((c) => ({ id: c, css: c, stops: [c] })),
  ...(
    [
      ["#ff8a65", "#d81b60"],
      ["#4facfe", "#00f2fe"],
      ["#43e97b", "#38f9d7"],
      ["#a18cd1", "#fbc2eb"],
      ["#f6d365", "#fda085"],
      ["#30cfd0", "#330867"],
    ] as const
  ).map((s) => ({ id: s.join("-"), css: `linear-gradient(135deg, ${s[0]}, ${s[1]})`, stops: s })),
];

export const layerImageUrl = (l: Layer) => (l.kind === "emoji" ? emojiImageUrl(l.src) : l.src);

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Рисует аватар в квадрат size×size: фон, затем слои снизу вверх. */
export async function renderAvatar(bg: Background, layers: readonly Layer[], size = 640): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  if (bg.stops.length > 1) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    bg.stops.forEach((c, i) => g.addColorStop(i / (bg.stops.length - 1), c));
    ctx.fillStyle = g;
  } else ctx.fillStyle = bg.stops[0] ?? "#65aadd";
  ctx.fillRect(0, 0, size, size);
  const images = await Promise.all(layers.map((l) => loadImage(layerImageUrl(l))));
  layers.forEach((l, i) => {
    const img = images[i];
    if (!img || !img.naturalWidth) return;
    const box = l.scale * size;
    const k = box / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, l.x * size - w / 2, l.y * size - h / 2, w, h);
  });
  return canvas;
}

export function canvasToFile(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], "avatar.jpg", { type: "image/jpeg" })) : reject(new Error("Не удалось собрать картинку"))), "image/jpeg", 0.92)
  );
}

export function posterOf(canvas: HTMLCanvasElement): string {
  const small = document.createElement("canvas");
  small.width = 256;
  small.height = 256;
  small.getContext("2d")?.drawImage(canvas, 0, 0, 256, 256);
  return small.toDataURL("image/jpeg", 0.85);
}

/** Анимированные стикеры (tgs/webm/json) на холст не нарисовать — берём только картинки. */
export const isStaticImage = (url: string) => !/\.(tgs|json|webm|mp4|lottie)(\?|$)/i.test(url);
