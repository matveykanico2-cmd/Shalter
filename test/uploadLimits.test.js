const { test } = require("node:test");
const assert = require("node:assert/strict");
const { limitFor, formatLimit, tooLargeError, UPLOADABLE_KINDS, DEFAULT_LIMIT } = require("../server/lib/uploadLimits");

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

test("limitFor даёт свой потолок для известных типов и дефолт для чужих", () => {
  assert.equal(limitFor("video"), 5 * GB);
  assert.equal(limitFor("avatar"), 20 * MB);
  assert.equal(limitFor("что-то-неизвестное"), DEFAULT_LIMIT);
});

test("formatLimit читается человеком", () => {
  assert.equal(formatLimit(5 * GB), "5 ГБ");
  assert.equal(formatLimit(20 * MB), "20 МБ");
  assert.equal(formatLimit(1.5 * GB), "1.5 ГБ");
});

test("tooLargeError называет тип и его потолок", () => {
  const msg = tooLargeError("voice");
  assert.match(msg, /Голосовое сообщение/);
  assert.match(msg, /5 ГБ/);
});

test("UPLOADABLE_KINDS содержит медиа-типы и не содержит чистых метаданных", () => {
  assert.ok(UPLOADABLE_KINDS.has("image"));
  assert.ok(UPLOADABLE_KINDS.has("voice"));
  assert.ok(!UPLOADABLE_KINDS.has("location"));
  assert.ok(!UPLOADABLE_KINDS.has("poll"));
});
