// Авторитетная проверка пользовательской анимированной сцены.
//
// Сцена — это данные, из которых на клиенте (public/js/lib/customScene.js)
// собирается кастомный стикер, эмодзи или подарок. Она пользовательская и
// уходит в чужие чаты, поэтому форма пинуется здесь, на сервере, а не там, где
// сцену случится показать, — тот же принцип, что у sanitizeSticker.js и
// sanitizeAttachments.js. Клиентская версия (customScene.js's
// sanitizeCustomScene) — точная копия этих правил, но авторитет за этим файлом:
// что бы клиент ни прислал, в базу ложится только прошедшее отсюда.
//
// Отдельно от рендера: класс анимации и тип фигуры становятся именами CSS-
// классов, а цвет — значением атрибута fill, поэтому первые ограничены белым
// списком, а цвет — строго hex. Ничего из сцены не может стать разметкой.

const ANIM_IDS = new Set([
  "none", "bounce", "float", "spin", "pulse", "heartbeat",
  "wave", "swing", "shake", "pop", "blink", "rise", "wiggle",
]);
const SHAPE_IDS = new Set(["draw", "emoji", "circle", "ellipse", "rect", "star", "heart", "text"]);

const MAX_LAYERS = 12;
const MAX_KEYS = 30;
const MAX_STROKES = 60;
const MAX_POINTS = 400;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function num(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
function hex(v, dflt) {
  return typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : dflt;
}

function sanitizeStroke(s) {
  if (!s || typeof s !== "object") return undefined;
  const pts = Array.isArray(s.pts)
    ? s.pts
        .slice(0, MAX_POINTS)
        .map((p) => (Array.isArray(p) && p.length >= 2 ? [num(p[0], 0, 100, 0), num(p[1], 0, 100, 0)] : null))
        .filter(Boolean)
    : [];
  if (!pts.length) return undefined;
  return { color: hex(s.color, "#000000"), width: num(s.width, 1, 40, 4), pts };
}

function sanitizeLayer(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  if (!SHAPE_IDS.has(raw.type)) return undefined;
  const type = raw.type;
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
    layer.strokes = Array.isArray(raw.strokes)
      ? raw.strokes.slice(0, MAX_STROKES).map(sanitizeStroke).filter(Boolean)
      : [];
  }
  // Покадровая анимация: ключи-позы во времени (см. public/js/lib/customScene.js).
  if (Array.isArray(raw.keys) && raw.keys.length) {
    layer.keys = raw.keys
      .slice(0, MAX_KEYS)
      .map((k) => {
        const key = {
          t: num(k && k.t, 0, 60, 0),
          dx: num(k && k.dx, -100, 100, 0),
          dy: num(k && k.dy, -100, 100, 0),
          rot: num(k && k.rot, -360, 360, 0),
          scale: num(k && k.scale, 0, 4, 1),
          opacity: num(k && k.opacity, 0, 1, 1),
        };
        const f = hex(k && k.fill, null);
        if (f) key.fill = f;
        return key;
      })
      .sort((a, b) => a.t - b.t);
  }
  return layer;
}

// Всегда возвращает валидную сцену; при мусоре на входе — пустую. Второй
// аргумент отмечает «сцена обязана иметь хотя бы один слой» — тогда пустая
// считается недопустимой и возвращается undefined (вызывающий ответит 400).
function sanitizeScene(raw, { requireLayers = false } = {}) {
  const scene = raw && typeof raw === "object" ? raw : {};
  const layers = Array.isArray(scene.layers)
    ? scene.layers.slice(0, MAX_LAYERS).map(sanitizeLayer).filter(Boolean)
    : [];
  if (requireLayers && layers.length === 0) return undefined;
  return {
    v: 1,
    loop: num(scene.loop, 1, 12, 3),
    bg: scene.bg === null || scene.bg === undefined ? null : hex(scene.bg, null),
    layers,
  };
}

// Эмодзи-подпись сцены — для уведомлений и списка чатов, где саму сцену не
// нарисуешь. Первый эмодзи-слой, иначе 🎨. Зеркалит customScene.js.
function sceneSummaryEmoji(raw) {
  const scene = sanitizeScene(raw);
  const em = scene.layers.find((l) => l.type === "emoji");
  return em?.emoji || "🎨";
}

module.exports = { sanitizeScene, sceneSummaryEmoji, MAX_LAYERS };
