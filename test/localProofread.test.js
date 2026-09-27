const { test } = require("node:test");
const assert = require("node:assert/strict");
const { localProofread } = require("../server/lib/localProofread");

// Один помощник: применяет к тексту исправление первой находки с заданным типом
// (или первой вообще) — так проверяем и offset/length, и предложенную замену.
function applyFirst(text, predicate) {
  const m = localProofread(text).find(predicate ?? (() => true));
  if (!m || !m.replacements.length) return null;
  return text.slice(0, m.offset) + m.replacements[0] + text.slice(m.offset + m.length);
}

test("пустой/пробельный текст — без находок", () => {
  assert.deepEqual(localProofread(""), []);
  assert.deepEqual(localProofread("   \n "), []);
  assert.deepEqual(localProofread(null), []);
});

test("чистый текст — без находок", () => {
  assert.deepEqual(localProofread("Привет, как дела?"), []);
  assert.deepEqual(localProofread("Hello there, friend."), []);
});

test("словарь опечаток: вообщем → в общем", () => {
  const fixed = applyFirst("вообщем всё хорошо", (m) => m.type === "misspelling");
  assert.equal(fixed, "в общем всё хорошо");
});

test("опечатка сохраняет заглавную букву", () => {
  const fixed = applyFirst("Извените меня", (m) => m.type === "misspelling");
  assert.equal(fixed, "Извините меня");
});

test("английская опечатка: teh → the", () => {
  const fixed = applyFirst("teh cat", (m) => m.type === "misspelling");
  assert.equal(fixed, "the cat");
});

test("повтор слова подряд: что что → что", () => {
  const fixed = applyFirst("я думаю что что это верно", (m) => m.type === "duplication");
  assert.equal(fixed, "я думаю что это верно");
});

test("двойной пробел → один", () => {
  const fixed = applyFirst("привет  мир", (m) => m.type === "typography");
  assert.equal(fixed, "привет мир");
});

test("пробел перед запятой убирается", () => {
  const fixed = applyFirst("слово , ещё", (m) => m.short === "Пробел перед знаком");
  assert.equal(fixed, "слово, ещё");
});

test("пропущенный пробел после запятой добавляется", () => {
  const fixed = applyFirst("привет,как дела", (m) => m.short === "Пробел после знака");
  assert.equal(fixed, "привет, как дела");
});

test("точку внутри числа/сокращения не трогаем (нет правила на точку)", () => {
  const m = localProofread("цена 3.14 рубля");
  assert.equal(m.filter((x) => x.short === "Пробел после знака").length, 0);
});

test("внутри ссылки ничего не правим (запятая — часть адреса)", () => {
  assert.deepEqual(localProofread("http://a.b/x,y"), []);
});

test("запятая после адреса почты (вне адреса) — правится", () => {
  const mail = localProofread("пиши на a@b.ru,отвечу");
  assert.ok(mail.some((m) => m.short === "Пробел после знака"));
});

test("орфография по словарю: малако → молоко (нет в фикс-словаре)", () => {
  const fixed = applyFirst("малако", (m) => m.type === "misspelling");
  assert.equal(fixed, "молоко");
});

test("орфография: харашо → хорошо, сабака → собака", () => {
  assert.equal(applyFirst("харашо", (m) => m.type === "misspelling"), "хорошо");
  assert.equal(applyFirst("сабака", (m) => m.type === "misspelling"), "собака");
});

test("правильные словоформы НЕ помечаются (нет ложных срабатываний)", () => {
  for (const w of ["работает", "делает", "сегодня", "компьютер", "сообщение", "человек", "молоко", "хорошо", "спасибо"]) {
    assert.equal(localProofread(w).length, 0, w);
  }
});

test("смешанная раскладка: латинская буква в русском слове → чинится", () => {
  const fixed = applyFirst("пpивет друг", (m) => m.short === "Раскладка");
  assert.equal(fixed, "привет друг"); // p латинская → р
});

test("чистое русское и чистое английское слово не считаются раскладкой", () => {
  assert.equal(localProofread("привет hello").filter((m) => m.short === "Раскладка").length, 0);
});

test("повтор буквы 4+ раз → схлопывается", () => {
  const fixed = applyFirst("приветттт", (m) => m.short === "Повтор буквы");
  assert.equal(fixed, "привет");
});

test("три одинаковые буквы (4+ нет) не трогаем", () => {
  assert.equal(localProofread("ааа").filter((m) => m.short === "Повтор буквы").length, 0);
});

test("новые словарные опечатки", () => {
  assert.equal(applyFirst("пожалуста помоги", (m) => m.type === "misspelling"), "пожалуйста помоги");
  assert.equal(applyFirst("ты будеш дома", (m) => m.type === "misspelling"), "ты будешь дома");
});

test("дефис между пробелами → тире", () => {
  const fixed = applyFirst("это - важно", (m) => m.short === "Тире");
  assert.equal(fixed, "это — важно");
});

test("дефис внутри слова (кто-то) не трогаем", () => {
  assert.equal(localProofread("кто-то пришёл").filter((m) => m.short === "Тире").length, 0);
});

test("offset/length указывают на реальный фрагмент", () => {
  const text = "слово ,тут";
  for (const m of localProofread(text)) {
    assert.equal(typeof m.offset, "number");
    assert.ok(m.offset >= 0 && m.offset + m.length <= text.length);
  }
});

test("все находки имеют нужную форму", () => {
  for (const m of localProofread("вообщем  привет,как дела дела")) {
    assert.ok("offset" in m && "length" in m && Array.isArray(m.replacements) && "type" in m);
    assert.equal(typeof m.message, "string");
  }
});
