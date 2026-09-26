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

// Рисует сцену как <svg>. `size` — сторона в пикселях; `replay` включает
// «въезд» (лёгкое появление), как у встроенных сцен.
export function renderCustomScene(rawScene, { size = 84, replay = false } = {}) {
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
    // Внешняя группа несёт базовый поворот (атрибутом), внутренняя — движение
    // (CSS-анимацией). Они на разных элементах, поэтому поворот и анимация
    // складываются, а не затирают друг друга.
    const outer = document.createElementNS(SVG_NS, "g");
    if (layer.rot) outer.setAttribute("transform", `rotate(${layer.rot} ${layer.x} ${layer.y})`);
    const inner = document.createElementNS(SVG_NS, "g");
    if (layer.anim && layer.anim !== "none") {
      inner.setAttribute("class", `ce-anim ce-${layer.anim}`);
      inner.style.animationDuration = `${layer.dur}s`;
      if (layer.delay) inner.style.animationDelay = `${layer.delay}s`;
    }
    inner.appendChild(shape);
    outer.appendChild(inner);
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
