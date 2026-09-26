// Пользовательские анимированные сцены — то, что рисует «аниматор» (редактор в
// components/animatorEditor.js), и то, из чего собраны кастомные стикеры,
// эмодзи и подарки.
//
// Встроенные наборы (lib/drawnArt.js, lib/characters.js, lib/animScenes.js) —
// это статичная SVG-разметка строкой, написанная руками разработчика: туда
// пользовательский ввод не попадает, поэтому строка безопасна. Здесь наоборот —
// геометрию и цвета задаёт пользователь и она уходит в чужие чаты, поэтому:
//
//   1. Сцена — это ДАННЫЕ (JSON), а не разметка. Ни строчки пользовательского
//      текста не превращается в HTML/SVG-разметку.
//   2. Рендер собирается через createElementNS + setAttribute, а подписи и
//      эмодзи ставятся только через textContent. Никакого innerHTML — значит
//      сцена не может стать разметкой, чем бы её ни заполнили.
//   3. Всё, что приходит в сцену, прогоняется через sanitizeCustomScene: числа
//      зажимаются в диапазон, цвета — только hex, анимации и фигуры — только из
//      белого списка. Ровно тот же разбор живёт на сервере
//      (server/lib/sanitizeScene.js) — он и есть авторитетный; здесь дубль,
//      чтобы редактор не давал собрать то, что сервер потом отвергнет.

const SVG_NS = "http://www.w3.org/2000/svg";

// Словарь движений. Имя анимации — это и есть CSS-класс `ce-<anim>` (кадры
// описаны в styles/components.css). Каждый слой играет ровно одно движение;
// расхождение задержек между слоями и создаёт ощущение «сцены», а не «дёргается
// всё сразу».
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
const ANIM_IDS = new Set(CE_ANIMS.map((a) => a.id));

// Фигуры. `emoji`/`text` рисуются как <text>, остальное — как примитивы. star и
// heart дают «стикерную» выразительность без произвольных путей: их геометрия
// фиксирована и лишь масштабируется, пользователь не задаёт координаты кривых.
export const CE_SHAPES = [
  { id: "emoji", label: "Эмодзи" },
  { id: "circle", label: "Круг" },
  { id: "ellipse", label: "Овал" },
  { id: "rect", label: "Прямоугольник" },
  { id: "star", label: "Звезда" },
  { id: "heart", label: "Сердце" },
  { id: "text", label: "Текст" },
];
const SHAPE_IDS = new Set(CE_SHAPES.map((s) => s.id));

export const CE_MAX_LAYERS = 12;
export const CE_MAX_KEYS = 30; // ключей на слой
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const num = (v, min, max, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
};
const hex = (v, dflt) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : dflt);

// Одна фигура — приводится к известной форме. Возвращает undefined, если тип
// фигуры не из белого списка: такой слой просто выпадает, а не роняет сцену.
function sanitizeLayer(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const type = SHAPE_IDS.has(raw.type) ? raw.type : undefined;
  if (!type) return undefined;
  const layer = {
    type,
    x: num(raw.x, 0, 100, 50),
    y: num(raw.y, 0, 100, 50),
    fill: hex(raw.fill, "#ff8a3d"),
    opacity: num(raw.opacity, 0, 1, 1),
    rot: num(raw.rot, -180, 180, 0),
    anim: ANIM_IDS.has(raw.anim) ? raw.anim : "none",
    delay: num(raw.delay, 0, 8, 0),
    dur: num(raw.dur, 0.3, 8, 1.6),
  };
  if (type === "emoji") {
    // Одна графема эмодзи; ограничиваем длину, чтобы в поле не уехала строка.
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
  }
  // Покадровая анимация: ключи во времени. Каждый ключ — поза относительно
  // базового положения слоя (смещение dx/dy в единицах вьюбокса, поворот,
  // масштаб, прозрачность, необязательно цвет). Если ключей нет — слой играет
  // именованный пресет (anim), как раньше; так старые сцены продолжают работать.
  if (Array.isArray(raw.keys) && raw.keys.length) {
    layer.keys = raw.keys
      .slice(0, CE_MAX_KEYS)
      .map((k) => {
        const key = {
          t: num(k?.t, 0, 60, 0),
          dx: num(k?.dx, -100, 100, 0),
          dy: num(k?.dy, -100, 100, 0),
          rot: num(k?.rot, -360, 360, 0),
          scale: num(k?.scale, 0, 4, 1),
          opacity: num(k?.opacity, 0, 1, 1),
        };
        const f = hex(k?.fill, null);
        if (f) key.fill = f;
        return key;
      })
      .sort((a, b) => a.t - b.t);
  }
  return layer;
}

// Полная проверка сцены. Всегда возвращает валидную сцену (пустую, если вход
// мусорный) — вызывающему не нужно ловить исключения.
export function sanitizeCustomScene(raw) {
  const scene = raw && typeof raw === "object" ? raw : {};
  const layers = Array.isArray(scene.layers)
    ? scene.layers.slice(0, CE_MAX_LAYERS).map(sanitizeLayer).filter(Boolean)
    : [];
  return {
    v: 1,
    loop: num(scene.loop, 1, 12, 3),
    bg: scene.bg === null || scene.bg === undefined ? null : hex(scene.bg, null),
    layers,
  };
}

export function blankScene() {
  return { v: 1, loop: 3, bg: null, layers: [] };
}

// Геометрия звезды/сердца в локальных координатах 100×100 вокруг (0,0),
// масштабируется под `size`. Пути фиксированы — пользователь их не задаёт.
function starPath(cx, cy, size) {
  const outer = size / 2;
  const inner = outer * 0.42;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}
function heartPath(cx, cy, size) {
  const s = size / 32; // базовый путь нарисован в ~32px, масштабируем
  const p = (x, y) => `${(cx + x * s).toFixed(2)},${(cy + y * s).toFixed(2)}`;
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

function makeShape(layer) {
  const { type, x, y, fill } = layer;
  let node;
  if (type === "circle") {
    node = document.createElementNS(SVG_NS, "circle");
    node.setAttribute("cx", x);
    node.setAttribute("cy", y);
    node.setAttribute("r", layer.r);
    node.setAttribute("fill", fill);
  } else if (type === "ellipse") {
    node = document.createElementNS(SVG_NS, "ellipse");
    node.setAttribute("cx", x);
    node.setAttribute("cy", y);
    node.setAttribute("rx", layer.w / 2);
    node.setAttribute("ry", layer.h / 2);
    node.setAttribute("fill", fill);
  } else if (type === "rect") {
    node = document.createElementNS(SVG_NS, "rect");
    node.setAttribute("x", x - layer.w / 2);
    node.setAttribute("y", y - layer.h / 2);
    node.setAttribute("width", layer.w);
    node.setAttribute("height", layer.h);
    node.setAttribute("rx", layer.rx);
    node.setAttribute("fill", fill);
  } else if (type === "star" || type === "heart") {
    node = document.createElementNS(SVG_NS, "path");
    node.setAttribute("d", type === "star" ? starPath(x, y, layer.size) : heartPath(x, y, layer.size));
    node.setAttribute("fill", fill);
  } else if (type === "emoji" || type === "text") {
    node = document.createElementNS(SVG_NS, "text");
    node.setAttribute("x", x);
    node.setAttribute("y", y);
    node.setAttribute("text-anchor", "middle");
    node.setAttribute("dominant-baseline", "central");
    node.setAttribute("font-size", layer.size);
    if (type === "text") node.setAttribute("fill", fill);
    // Только textContent — подпись/эмодзи никогда не становятся разметкой.
    node.textContent = type === "emoji" ? layer.emoji : layer.text;
  }
  if (node && layer.opacity < 1) node.setAttribute("opacity", layer.opacity);
  return node;
}

// ── Покадровая анимация ──────────────────────────────────────────────────────

const DEFAULT_POSE = { dx: 0, dy: 0, rot: 0, scale: 1, opacity: 1, fill: null };

// CSS-строка трансформа для позы. px в SVG = единицы вьюбокса, поэтому смещение
// задаётся напрямую; transform-box: fill-box (ставится на элементе) крутит и
// масштабирует вокруг центра самой фигуры.
function poseTransform(p) {
  return `translate(${p.dx}px, ${p.dy}px) rotate(${p.rot}deg) scale(${p.scale})`;
}

// Поза слоя в момент t (секунды): линейная интерполяция между соседними
// ключами. До первого ключа держим первый, после последнего — последний.
// Используется для статичного предпросмотра на позиции таймлайна.
export function sampleLayerAt(layer, t) {
  const keys = layer.keys;
  if (!keys || !keys.length) return { ...DEFAULT_POSE, opacity: layer.opacity ?? 1, fill: layer.fill ?? null };
  if (t <= keys[0].t) return poseOf(keys[0], layer);
  if (t >= keys[keys.length - 1].t) return poseOf(keys[keys.length - 1], layer);
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.t - a.t || 1;
  const f = (t - a.t) / span;
  const lerp = (x, y) => x + (y - x) * f;
  return {
    dx: lerp(a.dx, b.dx),
    dy: lerp(a.dy, b.dy),
    rot: lerp(a.rot, b.rot),
    scale: lerp(a.scale, b.scale),
    opacity: lerp(a.opacity, b.opacity),
    // Цвет не интерполируем вручную (это делает браузер в WAAPI); для статичного
    // кадра берём цвет ближайшего предыдущего ключа.
    fill: a.fill ?? layer.fill ?? null,
  };
}

function poseOf(k, layer) {
  return { dx: k.dx, dy: k.dy, rot: k.rot, scale: k.scale, opacity: k.opacity, fill: k.fill ?? layer.fill ?? null };
}

// Кадры для Web Animations API. Возвращает массив кадров или null (меньше двух
// ключей — анимировать нечего, применим статично). Гарантируем кадры на 0 и 1,
// чтобы цикл был гладким, и строго возрастающие offset.
function buildFrames(layer, loop) {
  const keys = layer.keys;
  if (!keys || keys.length < 2 || loop <= 0) return null;
  const anyFill = keys.some((k) => k.fill);
  const frame = (k) => {
    const fr = { offset: Math.min(1, Math.max(0, k.t / loop)), transform: poseTransform(k), opacity: k.opacity };
    if (anyFill) fr.fill = k.fill ?? layer.fill ?? "#000000";
    return fr;
  };
  const frames = keys.map(frame);
  if (frames[0].offset > 0) frames.unshift({ ...frames[0], offset: 0 });
  if (frames[frames.length - 1].offset < 1) frames.push({ ...frames[frames.length - 1], offset: 1 });
  // Строго возрастающие offset — WAAPI не принимает равные/убывающие.
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].offset <= frames[i - 1].offset) frames[i].offset = Math.min(1, frames[i - 1].offset + 0.0001);
  }
  return frames;
}

// Применяет позу к элементу статично (без анимации) — для кадра на таймлайне.
function applyPose(node, pose) {
  node.style.transformBox = "fill-box";
  node.style.transformOrigin = "center";
  node.style.transform = poseTransform(pose);
  node.style.opacity = pose.opacity;
  if (pose.fill) node.setAttribute("fill", pose.fill);
}

// Рисует сцену как <svg>. `size` — сторона в пикселях; `replay` включает
// «въезд» (лёгкое появление), как у встроенных сцен. `atTime` (секунды)
// замораживает сцену на этом моменте вместо проигрывания — для предпросмотра
// на позиции таймлайна в редакторе.
export function renderCustomScene(rawScene, { size = 84, replay = false, atTime = null } = {}) {
  const scene = sanitizeCustomScene(rawScene);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", `ce-scene ${replay ? "ce-entrance" : ""}`);
  svg.style.width = `${size}px`;
  svg.style.height = `${size}px`;
  if (scene.bg) {
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", "100");
    bg.setAttribute("height", "100");
    bg.setAttribute("rx", "16");
    bg.setAttribute("fill", scene.bg);
    svg.appendChild(bg);
  }
  for (const layer of scene.layers) {
    const shape = makeShape(layer);
    if (!shape) continue;
    // Внешняя группа несёт базовый поворот (атрибутом), внутренняя — движение.
    // Они на разных элементах, поэтому базовый поворот и анимация складываются.
    const outer = document.createElementNS(SVG_NS, "g");
    if (layer.rot) outer.setAttribute("transform", `rotate(${layer.rot} ${layer.x} ${layer.y})`);

    if (layer.keys && layer.keys.length) {
      // Покадровая анимация: двигаем саму фигуру через Web Animations API
      // (или замораживаем на atTime для предпросмотра). transform-box: fill-box
      // крутит/масштабирует вокруг центра фигуры.
      shape.style.transformBox = "fill-box";
      shape.style.transformOrigin = "center";
      if (atTime != null) {
        applyPose(shape, sampleLayerAt(layer, atTime));
      } else {
        const frames = buildFrames(layer, scene.loop);
        if (frames && typeof shape.animate === "function") {
          shape.animate(frames, { duration: scene.loop * 1000, iterations: Infinity, easing: "ease-in-out" });
        } else {
          applyPose(shape, sampleLayerAt(layer, 0));
        }
      }
      outer.appendChild(shape);
    } else {
      const inner = document.createElementNS(SVG_NS, "g");
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

// Эмодзи-подпись для сцены — то, чем её показать там, где картинку не
// нарисуешь (уведомления, список чатов). Берём первый эмодзи-слой, иначе 🎨.
export function sceneSummaryEmoji(rawScene) {
  const scene = sanitizeCustomScene(rawScene);
  const em = scene.layers.find((l) => l.type === "emoji");
  return em?.emoji || "🎨";
}
