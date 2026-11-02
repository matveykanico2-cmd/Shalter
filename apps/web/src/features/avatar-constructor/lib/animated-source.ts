// Анимированные стикеры в конструкторе: lottie (.tgs — gzip, .json, .lottie — zip) и видео
// (.webm/.mp4). В предпросмотре они играют, на холст 640×640 ложится один неподвижный кадр.
// Плеер lottie — тот же, что у shared/lib/anim/lottie.ts (/js/vendor/lottie_light.min.js, только SVG).

import { loadLottiePlayer as loadSharedLottiePlayer } from "@/shared/lib/anim";

export type StickerFormat = "image" | "lottie" | "video";

export function stickerFormat(url: string): StickerFormat {
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  if (ext === "tgs" || ext === "json" || ext === "lottie") return "lottie";
  if (ext === "webm" || ext === "mp4") return "video";
  return "image";
}

const FRAME_TIMEOUT_MS = 8000;

export type LottieAnim = {
  totalFrames: number;
  isLoaded: boolean;
  goToAndStop(frame: number, isFrame: boolean): void;
  addEventListener(name: string, fn: () => void): void;
  destroy(): void;
};
type LottiePlayer = { loadAnimation(opts: Record<string, unknown>): LottieAnim };

/** Общий плеер из shared/lib/anim: один <script> на приложение, а не свой второй. */
export function loadLottiePlayer(): Promise<LottiePlayer> {
  return loadSharedLottiePlayer() as unknown as Promise<LottiePlayer>;
}

async function inflate(bytes: Uint8Array, format: "gzip" | "deflate-raw"): Promise<Uint8Array> {
  const stream = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Первый animations/*.json (или любой .json) из архива dotLottie — по центральному каталогу zip. */
async function unzipLottie(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: { name: string; method: number; size: number; offset: number }[] = [];
  for (let n = 0; n < count && view.getUint32(p, true) === 0x02014b50; n++) {
    const nameLen = view.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method: view.getUint16(p + 10, true), size: view.getUint32(p + 20, true), offset: view.getUint32(p + 42, true) });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  const entry = entries.find((e) => /^animations\/.+\.json$/i.test(e.name)) ?? entries.find((e) => /\.json$/i.test(e.name) && !/manifest/i.test(e.name));
  if (!entry) throw new Error("zip");
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.size);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflate(data, "deflate-raw");
  throw new Error("zip");
}

/** Данные lottie из файла любого из трёх видов: gzip (.tgs), zip (.lottie) или голый JSON. */
export async function parseLottie(buf: ArrayBuffer): Promise<unknown> {
  let bytes: Uint8Array = new Uint8Array(buf);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await inflate(bytes, "gzip");
  else if (bytes[0] === 0x50 && bytes[1] === 0x4b) bytes = await unzipLottie(bytes);
  return JSON.parse(new TextDecoder().decode(bytes));
}

const dataCache = new Map<string, Promise<unknown>>();
export function loadLottieData(url: string): Promise<unknown> {
  let data = dataCache.get(url);
  if (!data) {
    data = fetch(url, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(`lottie ${r.status}`);
        return r.arrayBuffer();
      })
      .then(parseLottie);
    data.catch(() => dataCache.delete(url));
    dataCache.set(url, data);
  }
  return data;
}

/** Монтирует проигрывающийся lottie в контейнер; возвращает функцию остановки. */
export function mountLottie(container: HTMLElement, url: string): () => void {
  let anim: LottieAnim | null = null;
  let cancelled = false;
  Promise.all([loadLottiePlayer(), loadLottieData(url)])
    .then(([lottie, data]) => {
      if (cancelled) return;
      anim = lottie.loadAnimation({ container, renderer: "svg", loop: true, autoplay: true, animationData: data, rendererSettings: { preserveAspectRatio: "xMidYMid meet" } });
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    anim?.destroy();
  };
}

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), FRAME_TIMEOUT_MS))]);
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // /uploads — тот же origin; crossOrigin нужен, если файлы отдаёт S3 по редиректу, иначе холст «испорчен».
    if (!url.startsWith("blob:") && !url.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Кадр lottie как картинка: SVG-рендер на середине анимации → XMLSerializer → blob: URL (холст не портится). */
export function lottieFrame(url: string, size = 640): Promise<HTMLImageElement | null> {
  const run = async () => {
    const [lottie, data] = await Promise.all([loadLottiePlayer(), loadLottieData(url)]);
    const host = document.createElement("div");
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${size}px;height:${size}px;pointer-events:none;opacity:0`;
    document.body.appendChild(host);
    try {
      const anim = lottie.loadAnimation({ container: host, renderer: "svg", loop: false, autoplay: false, animationData: data, rendererSettings: { preserveAspectRatio: "xMidYMid meet" } });
      await new Promise<void>((resolve) => {
        if (anim.isLoaded) resolve();
        else anim.addEventListener("DOMLoaded", () => resolve());
      });
      anim.goToAndStop(Math.floor(Math.max(0, anim.totalFrames - 1) / 2), true);
      const svg = host.querySelector("svg");
      if (!svg) return null;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      anim.destroy();
      try {
        return await loadImage(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } finally {
      host.remove();
    }
  };
  return withTimeout(run().catch(() => null), null);
}

/** Кадр видео на ~0,5 с (или середине короткого ролика). */
export function videoFrame(url: string): Promise<HTMLVideoElement | null> {
  const run = new Promise<HTMLVideoElement | null>((resolve) => {
    const v = document.createElement("video");
    if (!url.startsWith("blob:")) v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 1;
      v.currentTime = Math.min(0.5, d / 2);
    };
    v.onseeked = () => resolve(v.videoWidth ? v : null);
    v.onerror = () => resolve(null);
    v.src = url;
    v.load();
  });
  return withTimeout(run, null);
}

export type Drawable = { source: CanvasImageSource; width: number; height: number };

/** Источник для drawImage по ссылке слоя — картинка, кадр lottie или кадр видео. */
export async function loadDrawable(url: string): Promise<Drawable | null> {
  const format = stickerFormat(url);
  if (format === "video") {
    const v = await videoFrame(url);
    return v ? { source: v, width: v.videoWidth, height: v.videoHeight } : null;
  }
  const img = format === "lottie" ? await lottieFrame(url) : await loadImage(url);
  return img && img.naturalWidth ? { source: img, width: img.naturalWidth, height: img.naturalHeight } : null;
}
