const { test } = require("node:test");
const assert = require("node:assert/strict");
const { phoneKey, indexUsersByPhone } = require("../server/lib/phoneMatch");

test("phoneKey сводит разные записи одного номера к одному ключу", () => {
  const key = "79991234567";
  assert.equal(phoneKey("+7 (999) 123-45-67"), key);
  assert.equal(phoneKey("79991234567"), key);
  assert.equal(phoneKey("8 999 123 45 67"), key); // 8 → 7 для 11-значного
});

test("phoneKey: 8-префикс меняется на 7 только у 11-значного номера", () => {
  assert.equal(phoneKey("89991234567"), "79991234567");
  assert.equal(phoneKey("812345"), "812345"); // короткий — не трогаем
});

test("phoneKey возвращает null для пустого/без цифр", () => {
  assert.equal(phoneKey(""), null);
  assert.equal(phoneKey("abc"), null);
  assert.equal(phoneKey(null), null);
});

test("indexUsersByPhone пропускает ботов и недоступных, индексирует остальных", () => {
  const users = [
    { id: "u1", phone: "+79990000001", isBot: false },
    { id: "u2", phone: "89990000002", isBot: false },
    { id: "bot", phone: "+79990000003", isBot: true },
    { id: "hidden", phone: "+79990000004", isBot: false },
  ];
  const index = indexUsersByPhone(users, (u) => u.id !== "hidden");
  assert.equal(index.get("79990000001").id, "u1");
  assert.equal(index.get("79990000002").id, "u2"); // 8 → 7 нормализован
  assert.equal(index.has("79990000003"), false); // бот
  assert.equal(index.has("79990000004"), false); // недоступен
});
