const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EMAIL_RE, PHONE_RE, USERNAME_RE, normalizePhone, isValidBirthday } = require("../server/lib/validators");

test("email: принимает обычные, отвергает без @ / без домена / с пробелом", () => {
  for (const ok of ["a@b.ru", "user.name@mail.example.com"]) assert.ok(EMAIL_RE.test(ok), ok);
  for (const bad of ["ab.ru", "a@b", "a b@c.ru", "@b.ru", ""]) assert.ok(!EMAIL_RE.test(bad), bad);
});

test("телефон: 10–15 цифр, необязательный плюс", () => {
  for (const ok of ["+79991234567", "79991234567", "1234567890"]) assert.ok(PHONE_RE.test(ok), ok);
  for (const bad of ["+7999", "abc", "+7 999 123", "123456789012345678"]) assert.ok(!PHONE_RE.test(bad), bad);
});

test("юзернейм: 3–32 символа из букв, цифр и подчёркивания", () => {
  for (const ok of ["abc", "a_b_c", "User123", "a".repeat(32)]) assert.ok(USERNAME_RE.test(ok), ok);
  for (const bad of ["ab", "a".repeat(33), "with space", "точки.нет", "дефис-нет"]) assert.ok(!USERNAME_RE.test(bad), bad);
});

test("normalizePhone убирает пробелы, скобки и дефисы, но не сам номер", () => {
  assert.equal(normalizePhone("+7 (999) 123-45-67"), "+79991234567");
  assert.equal(normalizePhone("  8 999 123 45 67 "), "89991234567");
  assert.equal(normalizePhone(null), "");
});

test("день рождения: реальные даты принимаются", () => {
  assert.equal(isValidBirthday("1990-02-28"), true);
  assert.equal(isValidBirthday("2000-12-31"), true);
});

test("день рождения: 31 февраля отвергается (Date не должен молча сдвинуть на март)", () => {
  assert.equal(isValidBirthday("2001-02-31"), false);
  assert.equal(isValidBirthday("2001-04-31"), false);
});

test("день рождения: будущее и до 1900 отвергаются, формат обязателен", () => {
  const nextYear = new Date().getUTCFullYear() + 1;
  assert.equal(isValidBirthday(`${nextYear}-01-01`), false);
  assert.equal(isValidBirthday("1899-12-31"), false);
  assert.equal(isValidBirthday("31-12-2000"), false);
  assert.equal(isValidBirthday(""), false);
  assert.equal(isValidBirthday(null), false);
});
