import { test } from "vitest";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Модули сервера — CommonJS, грузим их обычным require.
const require = createRequire(import.meta.url);
process.env.MESSAGES_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

const { searchTokens, searchQuery, hasLink } = require("../../server/lib/textCrypto");

function tokenSet(text: any) {
  return new Set(searchTokens(text).split(" ").filter(Boolean));
}
function queryMatches(indexText: any, query: any) {
  const have = tokenSet(indexText);
  const q = searchQuery(query);
  if (!q) return false;
  return q.split(" AND ").every((t: any) => have.has(t));
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
