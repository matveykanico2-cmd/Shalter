const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeGiftBackground } = require("../server/lib/giftBackground");

test("мусор → null", () => {
  for (const bad of [null, undefined, 1, "x", {}, { from: "red", to: "#fff" }, { from: "#fff" }]) {
    assert.equal(sanitizeGiftBackground(bad), null);
  }
});

test("валидная пара hex → нормализуется к нижнему регистру", () => {
  assert.deepEqual(sanitizeGiftBackground({ from: "#FFE08A", to: "#C8860B" }), { from: "#ffe08a", to: "#c8860b" });
});

test("короткий hex (#abc) принимается", () => {
  assert.deepEqual(sanitizeGiftBackground({ from: "#abc", to: "#def" }), { from: "#abc", to: "#def" });
});

test("инъекция в цвет отвергается", () => {
  assert.equal(sanitizeGiftBackground({ from: "url(javascript:alert(1))", to: "#000" }), null);
});

test("цвет узора и символ сохраняются вместе с цветами фона", () => {
  assert.deepEqual(sanitizeGiftBackground({ from: "#6f8cff", to: "#2a3dff", pattern: "#16209c", symbol: "moon" }), {
    from: "#6f8cff",
    to: "#2a3dff",
    pattern: "#16209c",
    symbol: "moon",
  });
});

test("битый цвет узора не ломает фон — узор просто не рисуется", () => {
  assert.deepEqual(sanitizeGiftBackground({ from: "#6f8cff", to: "#2a3dff", pattern: "red" }), { from: "#6f8cff", to: "#2a3dff" });
});

test("идентификатор символа принимается только из безопасных символов", () => {
  assert.equal(sanitizeGiftBackground({ from: "#fff", to: "#000", symbol: "../../etc/passwd" }).symbol, undefined);
  assert.equal(sanitizeGiftBackground({ from: "#fff", to: "#000", symbol: "Moon-1" }).symbol, undefined);
  assert.equal(sanitizeGiftBackground({ from: "#fff", to: "#000", symbol: "moon" }).symbol, "moon");
});

test("фон без узора и символа остаётся валидным (подарок до выбора фона)", () => {
  assert.deepEqual(sanitizeGiftBackground({ from: "#ffe08a", to: "#c8860b" }), { from: "#ffe08a", to: "#c8860b" });
});