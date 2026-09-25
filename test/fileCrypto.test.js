const { test } = require("node:test");
const assert = require("node:assert/strict");
const { headerFromBuffer, HEADER_MAX } = require("../server/lib/fileCrypto");

const MAGIC1 = Buffer.from("SHENC1");
const MAGIC2 = Buffer.from("SHENC2");

test("незашифрованный файл (без метки) → null", () => {
  assert.equal(headerFromBuffer(Buffer.from("обычные первые байты файла..")), null);
  assert.equal(headerFromBuffer(Buffer.alloc(0)), null);
  assert.equal(headerFromBuffer(null), null);
});

test("заголовок V1 (SHENC1 + 16-байт вектор) читается, длина 22, без keyId", () => {
  const iv = Buffer.alloc(16, 7);
  const h = headerFromBuffer(Buffer.concat([MAGIC1, iv]));
  assert.equal(h.len, 22);
  assert.equal(h.keyId, null);
  assert.ok(h.iv.equals(iv));
});

test("заголовок V2 (SHENC2 + 4-байт номер ключа + вектор) читается, длина 26", () => {
  const keyId = Buffer.alloc(4);
  keyId.writeUInt32BE(12345);
  const iv = Buffer.alloc(16, 9);
  const h = headerFromBuffer(Buffer.concat([MAGIC2, keyId, iv]));
  assert.equal(h.len, 26);
  assert.equal(h.keyId, 12345);
  assert.ok(h.iv.equals(iv));
});

test("HEADER_MAX вмещает самый длинный заголовок (V2)", () => {
  assert.equal(HEADER_MAX, 26);
});

test("обрезанный V2 (не хватает байт) не принимается за V2", () => {
  const short = Buffer.concat([MAGIC2, Buffer.alloc(4)]); // без вектора
  assert.equal(headerFromBuffer(short), null);
});
