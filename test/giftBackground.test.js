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
