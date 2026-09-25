const { test } = require("node:test");
const assert = require("node:assert/strict");
const { genId } = require("../server/lib/genId");

test("id начинается с префикса и разделителя", () => {
  assert.match(genId("m"), /^m_/);
  assert.match(genId("sess"), /^sess_/);
});

test("10 000 id подряд (та же миллисекунда) — все разные", () => {
  const seen = new Set();
  for (let i = 0; i < 10000; i++) seen.add(genId("m"));
  assert.equal(seen.size, 10000); // ни одного совпадения — иначе был бы дубль первичного ключа
});

test("id по времени в целом возрастают (префикс времени впереди)", async () => {
  const a = genId("x");
  await new Promise((r) => setTimeout(r, 5));
  const b = genId("x");
  // Обрезаем префикс и случайный хвост (10 hex), сравниваем временную часть.
  const timePart = (id) => id.slice(2, -10);
  assert.ok(timePart(b) >= timePart(a));
});
