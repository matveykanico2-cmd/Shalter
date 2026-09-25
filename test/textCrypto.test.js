// Ключ задаётся через окружение до require — тогда textCrypto не создаёт
// файл data/messages.key и тест ничего не пишет на диск.
process.env.MESSAGES_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { searchTokens, searchQuery, hasLink } = require("../server/lib/textCrypto");

// Отпечатки поиска: каждый токен запроса обязан присутствовать среди токенов
// проиндексированного текста — иначе поиск молча перестаёт находить.
function tokenSet(text) {
  return new Set(searchTokens(text).split(" ").filter(Boolean));
}
function queryMatches(indexText, query) {
  const have = tokenSet(indexText);
  const q = searchQuery(query);
  if (!q) return false;
  return q.split(" AND ").every((t) => have.has(t));
}

test("поиск находит по целому слову", () => {
  assert.ok(queryMatches("привет как дела", "дела"));
});

test("поиск находит по началу последнего слова (человек ещё печатает)", () => {
  assert.ok(queryMatches("сообщение отправлено", "сообщ"));
  assert.ok(queryMatches("сообщение отправлено", "сообщение"));
});

test("многословный запрос: все слова, кроме последнего, целиком", () => {
  assert.ok(queryMatches("завтра важная встреча", "важная встр"));
  assert.ok(!queryMatches("завтра важная встреча", "важная опоздал"));
});

test("регистр и диакритика не мешают (unicode61 remove_diacritics)", () => {
  assert.ok(queryMatches("Ёлка café", "елка"));
  assert.ok(queryMatches("Ёлка café", "cafe"));
});

test("длинное слово (>20) ищется по первым 20 буквам", () => {
  assert.ok(queryMatches("интернационализацией занимаются", "интернационализациейзанятость"));
});

test("пустой/пунктуационный запрос → null", () => {
  assert.equal(searchQuery(""), null);
  assert.equal(searchQuery("!!! ??? ..."), null);
});

test("hasLink находит ссылку в тексте", () => {
  assert.equal(hasLink("зайди на https://example.com"), 1);
  assert.equal(hasLink("HTTP тоже считается"), 1);
  assert.equal(hasLink("просто текст без ссылок"), 0);
  assert.equal(hasLink(""), 0);
});
