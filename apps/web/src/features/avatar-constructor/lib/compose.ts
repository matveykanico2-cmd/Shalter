import { emojiImageUrl } from "@/shared/lib/emoji-images";

import { type Drawable, loadDrawable } from "./animated-source";

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
  /** Поворот, градусы по часовой стрелке. */
  rotation: number;
};

export type Background = { id: string; css: string; stops: readonly string[] };

export const BACKGROUNDS: readonly Background[] = [
  { id: "transparent", css: "conic-gradient(#aeb3b7 25%, #fff 0 50%, #aeb3b7 0 75%, #fff 0) 0 / 20px 20px", stops: [] },
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

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 1.5;
export const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Угол в градусах в диапазон (-180, 180]. */
export const normalizeAngle = (deg: number) => {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180;
  return a === -180 ? 180 : a;
};

type Pt = { x: number; y: number };

/** Щипок двумя пальцами: масштаб — отношение расстояний, поворот — разница углов между пальцами. */
export function pinch(start: { scale: number; rotation: number }, from: [Pt, Pt], to: [Pt, Pt]) {
  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (a: Pt, b: Pt) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const d0 = dist(from[0], from[1]);
  const ratio = d0 > 0 ? dist(to[0], to[1]) / d0 : 1;
  return {
    scale: clampScale(start.scale * ratio),
    rotation: normalizeAngle(start.rotation + angle(to[0], to[1]) - angle(from[0], from[1])),
  };
}

/** Где и каким размером слой ложится на квадрат size×size: вписан в рамку scale·size, центр в (x, y). */
export function layerRect(l: Pick<Layer, "x" | "y" | "scale" | "rotation">, natW: number, natH: number, size: number) {
  const box = l.scale * size;
  const k = box / Math.max(natW, natH, 1);
  return { cx: l.x * size, cy: l.y * size, w: natW * k, h: natH * k, angle: ((l.rotation || 0) * Math.PI) / 180 };
}

/** Рисует аватар в квадрат size×size: фон, затем слои снизу вверх (анимированные — неподвижным кадром). */
export async function renderAvatar(bg: Background, layers: readonly Layer[], size = 640, load: (url: string) => Promise<Drawable | null> = loadDrawable): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  if (bg.id === "transparent") {
    ctx.clearRect(0, 0, size, size);
  } else if (bg.stops.length > 1) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    bg.stops.forEach((c, i) => g.addColorStop(i / (bg.stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.fillStyle = bg.stops[0] ?? "#65aadd";
    ctx.fillRect(0, 0, size, size);
  }
  const sources = await Promise.all(layers.map((l) => load(layerImageUrl(l))));
  layers.forEach((l, i) => {
    const src = sources[i];
    if (!src || !src.width || !src.height) return;
    const r = layerRect(l, src.width, src.height, size);
    ctx.save();
    ctx.translate(r.cx, r.cy);
    if (r.angle) ctx.rotate(r.angle);
    ctx.drawImage(src.source, -r.w / 2, -r.h / 2, r.w, r.h);
    ctx.restore();
  });
  return canvas;
}

export function canvasToFile(canvas: HTMLCanvasElement, transparent = false): Promise<File> {
  const type = transparent ? "image/png" : "image/jpeg";
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], transparent ? "avatar.png" : "avatar.jpg", { type })) : reject(new Error("Не удалось собрать картинку"))), type, 0.92)
  );
}

export function posterOf(canvas: HTMLCanvasElement, transparent = false): string {
  const small = document.createElement("canvas");
  small.width = 256;
  small.height = 256;
  small.getContext("2d")?.drawImage(canvas, 0, 0, 256, 256);
  return transparent ? small.toDataURL("image/png") : small.toDataURL("image/jpeg", 0.85);
}

