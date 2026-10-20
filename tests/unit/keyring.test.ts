import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import crypto from "node:crypto";

// Модули сервера — CommonJS, грузим их обычным require.
const require = createRequire(import.meta.url);
// У better-sqlite3 нет типов в зависимостях — тоже через require.
const Database = require("better-sqlite3");
const keyring = require("../../server/lib/keyring");

keyring.init(new Database(":memory:"));
const KEK = crypto.randomBytes(32);

test("currentKey возвращает 32-байтный ключ с номером", () => {
  const { id, key } = keyring.currentKey("messages", KEK);
  assert.equal(key.length, 32);
  assert.ok(Number.isInteger(id) && id > 0);
});

test("в пределах окна ротации ключ тот же", () => {
  const a = keyring.currentKey("messages", KEK);
  const b = keyring.currentKey("messages", KEK);
  assert.equal(a.id, b.id);
  assert.ok(a.key.equals(b.key));
});

test("getKey разворачивает ранее созданный ключ тем же мастером", () => {
  const { id, key } = keyring.currentKey("files", KEK);
  const back = keyring.getKey("files", id, KEK);
  assert.ok(back.equals(key));
});

test("назначения ('messages'/'files') не пересекаются по номерам", () => {
  const m = keyring.currentKey("messages", KEK);
  assert.throws(() => keyring.getKey("files", m.id, KEK));
});

test("несуществующий ключ — ошибка, а не тихий null", () => {
  assert.throws(() => keyring.getKey("messages", 999999, KEK));
});
