const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeScene, sceneSummaryEmoji, MAX_LAYERS } = require("../server/lib/sanitizeScene");

test("мусор на входе → пустая валидная сцена", () => {
  for (const bad of [null, undefined, 42, "x", {}, { layers: "no" }]) {
    const s = sanitizeScene(bad);
    assert.equal(s.v, 1);
    assert.deepEqual(s.layers, []);
  }
});

test("requireLayers: пустая сцена → undefined", () => {
  assert.equal(sanitizeScene({ layers: [] }, { requireLayers: true }), undefined);
  assert.ok(sanitizeScene({ layers: [{ type: "circle" }] }, { requireLayers: true }));
});

test("loop зажимается 1..12, bg только hex", () => {
  assert.equal(sanitizeScene({ loop: 999, layers: [] }).loop, 12);
  assert.equal(sanitizeScene({ loop: -5, layers: [] }).loop, 1);
  assert.equal(sanitizeScene({ bg: "javascript:1", layers: [] }).bg, null);
  assert.equal(sanitizeScene({ bg: "#ABCDEF", layers: [] }).bg, "#abcdef");
});

test("неизвестный тип фигуры выпадает", () => {
  const s = sanitizeScene({ layers: [{ type: "script" }, { type: "circle" }] });
  assert.equal(s.layers.length, 1);
  assert.equal(s.layers[0].type, "circle");
});

test("координаты и размеры зажимаются, fill только hex", () => {
  const [l] = sanitizeScene({ layers: [{ type: "circle", x: 9999, y: -50, r: 999, fill: "red" }] }).layers;
  assert.equal(l.x, 100);
  assert.equal(l.y, 0);
  assert.equal(l.r, 50);
  assert.equal(l.fill, "#ff8a3d");
});

test("эмодзи и текст ограничены по длине", () => {
  const [e] = sanitizeScene({ layers: [{ type: "emoji", emoji: "😀xxxxxxxxxx" }] }).layers;
  assert.ok(e.emoji.length <= 8);
  const [t] = sanitizeScene({ layers: [{ type: "text", text: "a".repeat(50) }] }).layers;
  assert.equal(t.text.length, 12);
});

test("не больше MAX_LAYERS слоёв", () => {
  const many = Array.from({ length: MAX_LAYERS + 10 }, () => ({ type: "circle" }));
  assert.equal(sanitizeScene({ layers: many }).layers.length, MAX_LAYERS);
});

test("анимация только из белого списка", () => {
  assert.equal(sanitizeScene({ layers: [{ type: "circle", anim: "evil" }] }).layers[0].anim, "none");
  assert.equal(sanitizeScene({ layers: [{ type: "circle", anim: "spin" }] }).layers[0].anim, "spin");
});

test("ключи покадровой анимации зажимаются", () => {
  const [l] = sanitizeScene({
    layers: [{ type: "circle", keys: [{ t: 999, dx: 9999, scale: 99, opacity: 5, fill: "nope" }] }],
  }).layers;
  assert.equal(l.keys.length, 1);
  assert.equal(l.keys[0].t, 60);
  assert.equal(l.keys[0].dx, 100);
  assert.equal(l.keys[0].scale, 4);
  assert.equal(l.keys[0].opacity, 1);
  assert.ok(!("fill" in l.keys[0]));
});

test("слой-кисть: штрихи и точки чистятся", () => {
  const [l] = sanitizeScene({
    layers: [{ type: "draw", strokes: [{ color: "bad", width: 999, pts: [[9999, -5], "no", [10, 20]] }, { pts: [] }] }],
  }).layers;
  assert.equal(l.strokes.length, 1);
  assert.equal(l.strokes[0].color, "#000000");
  assert.equal(l.strokes[0].width, 40);
  assert.deepEqual(l.strokes[0].pts, [[100, 0], [10, 20]]);
});

test("sceneSummaryEmoji: первый эмодзи или 🎨", () => {
  assert.equal(sceneSummaryEmoji({ layers: [{ type: "circle" }, { type: "emoji", emoji: "🔥" }] }), "🔥");
  assert.equal(sceneSummaryEmoji({ layers: [{ type: "circle" }] }), "🎨");
  assert.equal(sceneSummaryEmoji(null), "🎨");
});
