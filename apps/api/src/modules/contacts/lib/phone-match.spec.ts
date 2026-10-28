// Сравнение номеров (перенесён из contract-tests/unit/phoneMatch.test.ts вместе с удалением
// server/lib/phoneMatch.js).
import assert from "node:assert/strict";
import { test } from "vitest";
import type { User } from "../../users/model/domain.js";
import { indexUsersByPhone, phoneKey } from "./phone-match.js";

test("phoneKey сводит разные записи одного номера к одному ключу", () => {
  const key = "79991234567";
  assert.equal(phoneKey("+7 (999) 123-45-67"), key);
  assert.equal(phoneKey("79991234567"), key);
  assert.equal(phoneKey("8 999 123 45 67"), key);
});

test("phoneKey: 8-префикс меняется на 7 только у 11-значного номера", () => {
  assert.equal(phoneKey("89991234567"), "79991234567");
  assert.equal(phoneKey("812345"), "812345");
});

test("phoneKey возвращает null для пустого/без цифр", () => {
  assert.equal(phoneKey(""), null);
  assert.equal(phoneKey("abc"), null);
  assert.equal(phoneKey(null), null);
});

test("indexUsersByPhone пропускает ботов, индексирует остальных; при совпадении номера — последний", () => {
  const users = [
    { id: "u1", phone: "+79990000001", isBot: false },
    { id: "u2", phone: "89990000002", isBot: false },
    { id: "bot", phone: "+79990000003", isBot: true },
    { id: "u3", phone: "+7 999 000-00-01", isBot: false },
  ] as unknown as User[];
  const index = indexUsersByPhone(users);
  assert.equal(index.get("79990000001")!.id, "u3");
  assert.equal(index.get("79990000002")!.id, "u2");
  assert.equal(index.has("79990000003"), false);
});
