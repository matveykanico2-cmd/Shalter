// Свои эмодзи и стикеры-сцены (слои с анимациями и ключевыми кадрами) — перенос
// public/js/lib/customScene.js; анимации ce-* — в anim.css.
const SVG_NS = "http://www.w3.org/2000/svg";

export const CE_ANIMS = [
  { id: "none", label: "Без движения" },
  { id: "bounce", label: "Прыгает" },
  { id: "float", label: "Парит" },
  { id: "spin", label: "Вращается" },
  { id: "pulse", label: "Пульсирует" },
  { id: "heartbeat", label: "Бьётся" },
  { id: "wave", label: "Машет" },
  { id: "swing", label: "Качается" },
  { id: "shake", label: "Трясётся" },
  { id: "pop", label: "Появляется" },
  { id: "blink", label: "Мигает" },
  { id: "rise", label: "Взлетает" },
  { id: "wiggle", label: "Виляет" },
];
const ANIM_IDS = new Set<string>(CE_ANIMS.map((a) => a.id));

export const CE_SHAPES = [
  { id: "draw", label: "Кисть" },
  { id: "emoji", label: "Эмодзи" },
  { id: "circle", label: "Круг" },
  { id: "ellipse", label: "Овал" },
  { id: "rect", label: "Прямоугольник" },
  { id: "star", label: "Звезда" },
  { id: "heart", label: "Сердце" },
  { id: "text", label: "Текст" },
];
export const CE_MAX_STROKES = 60;
export const CE_MAX_POINTS = 400;
const SHAPE_IDS = new Set<string>(CE_SHAPES.map((s) => s.id));

export const CE_MAX_LAYERS = 12;
export const CE_MAX_KEYS = 30;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type Key = { t: number; dx: number; dy: number; rot: number; scale: number; opacity: number; fill?: string };
type Stroke = { color: string; width: number; pts: [number, number][] };
export type Layer = {
  type: string;
  x: number;
  y: number;
  fill: string;
  opacity: number;
  rot: number;
  anim: string;
  delay: number;
  dur: number;
  emoji?: string;
  text?: string;
  size?: number;
  r?: number;
  w?: number;
  h?: number;
  rx?: number;
  strokes?: Stroke[];
  keys?: Key[];
};
export type CustomScene = { v: 1; loop: number; bg: string | null; layers: Layer[] };
type Raw = Record<string, unknown>;

// Подарки с анимированными сценами: слои анимируются через Web Animations API с
// iterations: Infinity — даже скрытыми они тормозили бы ленту. Один наблюдатель на все
// сцены: сворачиваем анимацию, когда сцена не видна, и возобновляем — когда видна.
const sceneAnims = new WeakMap<Element, Animation[]>();
const sceneObserver =
  typeof IntersectionObserver === "function"
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            for (const a of sceneAnims.get(e.target) ?? []) {
              if (e.isIntersecting) a.play();
              else a.pause();
            }
          }
        },
        { threshold: 0.6 }
      )
    : null;

const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
};
function hex(v: unknown, dflt: string): string;
function hex(v: unknown, dflt: null): string | null;
function hex(v: unknown, dflt: string | null) {
  return typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : dflt;
}
const asRaw = (v: unknown): Raw | null => (v && typeof v === "object" ? (v as Raw) : null);

function sanitizeStroke(raw: unknown): Stroke | undefined {
  const s = asRaw(raw);
  if (!s) return undefined;
  const pts = Array.isArray(s.pts)
    ? s.pts
        .slice(0, CE_MAX_POINTS)
        .map((p: unknown) => (Array.isArray(p) && p.length >= 2 ? ([num(p[0], 0, 100, 0), num(p[1], 0, 100, 0)] as [number, number]) : null))
        .filter((p): p is [number, number] => !!p)
    : [];
  if (!pts.length) return undefined;
  return { color: hex(s.color, "#000000"), width: num(s.width, 1, 40, 4), pts };
}

function sanitizeLayer(input: unknown): Layer | undefined {
  const raw = asRaw(input);
  if (!raw || typeof raw.type !== "string" || !SHAPE_IDS.has(raw.type)) return undefined;
  const type = raw.type;
  const layer: Layer = {
    type,
    x: num(raw.x, 0, 100, 50),
    y: num(raw.y, 0, 100, 50),
    fill: hex(raw.fill, "#ff8a3d"),
    opacity: num(raw.opacity, 0, 1, 1),
    rot: num(raw.rot, -180, 180, 0),
    anim: typeof raw.anim === "string" && ANIM_IDS.has(raw.anim) ? raw.anim : "none",
    delay: num(raw.delay, 0, 8, 0),
    dur: num(raw.dur, 0.3, 8, 1.6),
  };
  if (type === "emoji") {
    layer.emoji = String(raw.emoji ?? "😀").trim().slice(0, 8) || "😀";
    layer.size = num(raw.size, 6, 100, 40);
  } else if (type === "text") {
    layer.text = String(raw.text ?? "").replace(/[\r\n]+/g, " ").slice(0, 12);
    layer.size = num(raw.size, 4, 60, 16);
  } else if (type === "circle") {
    layer.r = num(raw.r, 1, 50, 18);
  } else if (type === "rect") {
    layer.w = num(raw.w, 2, 100, 36);
    layer.h = num(raw.h, 2, 100, 24);
    layer.rx = num(raw.rx, 0, 50, 4);
  } else if (type === "ellipse") {
    layer.w = num(raw.w, 2, 100, 40);
    layer.h = num(raw.h, 2, 100, 28);
  } else if (type === "star" || type === "heart") {
    layer.size = num(raw.size, 4, 100, 34);
  } else if (type === "draw") {
    layer.strokes = Array.isArray(raw.strokes) ? raw.strokes.slice(0, CE_MAX_STROKES).map(sanitizeStroke).filter((s): s is Stroke => !!s) : [];
  }
  if (Array.isArray(raw.keys) && raw.keys.length) {
    layer.keys = raw.keys
      .slice(0, CE_MAX_KEYS)
      .map((input: unknown) => {
        const k = asRaw(input) ?? {};
        const key: Key = {
          t: num(k.t, 0, 60, 0),
          dx: num(k.dx, -100, 100, 0),
          dy: num(k.dy, -100, 100, 0),
          rot: num(k.rot, -360, 360, 0),
          scale: num(k.scale, 0, 4, 1),
          opacity: num(k.opacity, 0, 1, 1),
        };
        const f = hex(k.fill, null);
        if (f) key.fill = f;
        return key;
      })
      .sort((a, b) => a.t - b.t);
  }
  return layer;
}

export function sanitizeCustomScene(input: unknown): CustomScene {
  const scene = asRaw(input) ?? {};
  const layers = Array.isArray(scene.layers) ? scene.layers.slice(0, CE_MAX_LAYERS).map(sanitizeLayer).filter((l): l is Layer => !!l) : [];
  return { v: 1, loop: num(scene.loop, 1, 12, 3), bg: scene.bg === null || scene.bg === undefined ? null : hex(scene.bg, null), layers };
}

export function blankScene(): CustomScene {
  return { v: 1, loop: 3, bg: null, layers: [] };
}

function starPath(cx: number, cy: number, size: number) {
  const outer = size / 2;
  const inner = outer * 0.42;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

function heartPath(cx: number, cy: number, size: number) {
  const s = size / 32;
  const p = (x: number, y: number) => `${(cx + x * s).toFixed(2)},${(cy + y * s).toFixed(2)}`;
  return (
    `M${p(0, 10)}` +
    `C${p(-2, 4)} ${p(-8, -2)} ${p(-14, -2)}` +
    `C${p(-22, -2)} ${p(-22, 8)} ${p(-14, 14)}` +
    `C${p(-8, 18)} ${p(-2, 22)} ${p(0, 26)}` +
    `C${p(2, 22)} ${p(8, 18)} ${p(14, 14)}` +
    `C${p(22, 8)} ${p(22, -2)} ${p(14, -2)}` +
    `C${p(8, -2)} ${p(2, 4)} ${p(0, 10)}Z`
  );
}

function strokeToPath(pts: [number, number][]) {
  if (pts.length === 1) return `M${pts[0]![0].toFixed(2)} ${pts[0]![1].toFixed(2)} l0.01 0`;
  return "M" + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L");
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function makeShape(layer: Layer): SVGElement | null {
  const { type, x, y, fill } = layer;
  let node: SVGElement | null = null;
  if (type === "circle") node = svgEl("circle", { cx: x, cy: y, r: layer.r ?? 18, fill });
  else if (type === "ellipse") node = svgEl("ellipse", { cx: x, cy: y, rx: (layer.w ?? 40) / 2, ry: (layer.h ?? 28) / 2, fill });
  else if (type === "rect") {
    const w = layer.w ?? 36;
    const h = layer.h ?? 24;
    node = svgEl("rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: layer.rx ?? 4, fill });
  } else if (type === "star" || type === "heart") {
    node = svgEl("path", { d: type === "star" ? starPath(x, y, layer.size ?? 34) : heartPath(x, y, layer.size ?? 34), fill });
  } else if (type === "draw") {
    node = svgEl("g");
    for (const st of layer.strokes ?? []) {
      if (!st.pts.length) continue;
      node.appendChild(svgEl("path", { d: strokeToPath(st.pts), fill: "none", stroke: st.color, "stroke-width": st.width, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    }
  } else if (type === "emoji" || type === "text") {
    node = svgEl("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": layer.size ?? 16 });
    if (type === "text") node.setAttribute("fill", fill);
    node.textContent = (type === "emoji" ? layer.emoji : layer.text) ?? "";
  }
  if (node && layer.opacity < 1) node.setAttribute("opacity", String(layer.opacity));
  return node;
}

type Pose = { dx: number; dy: number; rot: number; scale: number; opacity: number; fill: string | null };
const DEFAULT_POSE: Pose = { dx: 0, dy: 0, rot: 0, scale: 1, opacity: 1, fill: null };

const poseTransform = (p: Pick<Pose, "dx" | "dy" | "rot" | "scale">) => `translate(${p.dx}px, ${p.dy}px) rotate(${p.rot}deg) scale(${p.scale})`;
const poseOf = (k: Key, layer: Layer): Pose => ({ dx: k.dx, dy: k.dy, rot: k.rot, scale: k.scale, opacity: k.opacity, fill: k.fill ?? layer.fill ?? null });

/** Поза слоя в момент t (для редактора и статичного кадра). */
export function sampleLayerAt(layer: Layer, t: number): Pose {
  const keys = layer.keys;
  if (!keys?.length) return { ...DEFAULT_POSE, opacity: layer.opacity ?? 1, fill: layer.fill ?? null };
  if (t <= keys[0]!.t) return poseOf(keys[0]!, layer);
  if (t >= keys.at(-1)!.t) return poseOf(keys.at(-1)!, layer);
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1]!.t <= t) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const f = (t - a.t) / (b.t - a.t || 1);
  const lerp = (x: number, y: number) => x + (y - x) * f;
  return { dx: lerp(a.dx, b.dx), dy: lerp(a.dy, b.dy), rot: lerp(a.rot, b.rot), scale: lerp(a.scale, b.scale), opacity: lerp(a.opacity, b.opacity), fill: a.fill ?? layer.fill ?? null };
}

function buildFrames(layer: Layer, loop: number): Keyframe[] | null {
  const keys = layer.keys;
  if (!keys || keys.length < 2 || loop <= 0) return null;
  const anyFill = keys.some((k) => k.fill);
  const frames: Keyframe[] = keys.map((k) => ({
    offset: Math.min(1, Math.max(0, k.t / loop)),
    transform: poseTransform(k),
    opacity: k.opacity,
    ...(anyFill ? { fill: k.fill ?? layer.fill ?? "#000000" } : {}),
  }));
  if ((frames[0]!.offset as number) > 0) frames.unshift({ ...frames[0]!, offset: 0 });
  if ((frames.at(-1)!.offset as number) < 1) frames.push({ ...frames.at(-1)!, offset: 1 });
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]!.offset as number;
    if ((frames[i]!.offset as number) <= prev) frames[i]!.offset = Math.min(1, prev + 0.0001);
  }
  return frames;
}

function applyPose(node: SVGElement, pose: Pose) {
  node.style.transformBox = "fill-box";
  node.style.transformOrigin = "center";
  node.style.transform = poseTransform(pose);
  node.style.opacity = String(pose.opacity);
  if (pose.fill) node.setAttribute("fill", pose.fill);
}

export function renderCustomScene(rawScene: unknown, { size = 84, replay = false, atTime = null }: { size?: number; replay?: boolean; atTime?: number | null } = {}) {
  const scene = sanitizeCustomScene(rawScene);
  const svg = svgEl("svg", { viewBox: "0 0 100 100", class: `ce-scene ${replay ? "ce-entrance" : ""}` });
  svg.style.width = `${size}px`;
  svg.style.height = `${size}px`;
  if (scene.bg) svg.appendChild(svgEl("rect", { x: 0, y: 0, width: 100, height: 100, rx: 16, fill: scene.bg }));
  for (const layer of scene.layers) {
    const shape = makeShape(layer);
    if (!shape) continue;
    const outer = svgEl("g");
    if (layer.rot) outer.setAttribute("transform", `rotate(${layer.rot} ${layer.x} ${layer.y})`);
    if (layer.keys?.length) {
      shape.style.transformBox = "fill-box";
      shape.style.transformOrigin = "center";
      if (atTime != null) applyPose(shape, sampleLayerAt(layer, atTime));
      else {
        const frames = buildFrames(layer, scene.loop);
        if (frames && typeof shape.animate === "function") {
          const anim = shape.animate(frames, { duration: scene.loop * 1000, iterations: Infinity, easing: "ease-in-out" });
          // Анимации — на корневом <svg>: на паузу, когда сцена ушла с экрана.
          sceneAnims.set(svg, [...(sceneAnims.get(svg) ?? []), anim]);
          sceneObserver?.observe(svg);
        } else applyPose(shape, sampleLayerAt(layer, 0));
      }
      outer.appendChild(shape);
    } else {
      const inner = svgEl("g");
      if (layer.anim && layer.anim !== "none") {
        inner.setAttribute("class", `ce-anim ce-${layer.anim}`);
        inner.style.animationDuration = `${layer.dur}s`;
        if (layer.delay) inner.style.animationDelay = `${layer.delay}s`;
      }
      inner.appendChild(shape);
      outer.appendChild(inner);
    }
    svg.appendChild(outer);
  }
  return svg;
}

/** Эмодзи-заменитель сцены — в превью и подписях. */
export function sceneSummaryEmoji(rawScene: unknown) {
  return sanitizeCustomScene(rawScene).layers.find((l) => l.type === "emoji")?.emoji || "🎨";
}
