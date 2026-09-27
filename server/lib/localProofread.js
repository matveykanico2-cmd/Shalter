// Встроенный корректор — «Hugo» без внешнего сервиса.
//
// LanguageTool (lib/languageTool.js) — мощный, но внешний: его может не быть
// (LANGUAGETOOL_URL не задан), он падает и перегружается. Тогда проверка текста
// раньше просто отвечала «не настроена». Здесь — свой лёгкий проход, который
// работает всегда: типографика (двойные пробелы, пробел перед запятой,
// пропущенный пробел после знака, повтор слова) и словарь частых опечаток.
//
// Формат совпадает с LanguageTool (offset/length/message/short/replacements/
// type в единицах UTF-16), поэтому и клиент (public/js/lib/hugo.js), и бот
// применяют исправления одинаково — их можно смешивать в одном списке.

// Однозначные опечатки: слово (в нижнем регистре) → верное. Только те, где
// исправление не зависит от контекста, чтобы не «чинить» правильный текст.
const WORD_FIXES = new Map(
  Object.entries({
    // Русский
    вообщем: "в общем",
    извените: "извините",
    агенство: "агентство",
    координально: "кардинально",
    черезчур: "чересчур",
    придти: "прийти",
    будующий: "будущий",
    следущий: "следующий",
    ихний: "их",
    ихнего: "их",
    ихние: "их",
    ихних: "их",
    малоко: "молоко",
    карова: "корова",
    сдесь: "здесь",
    зделать: "сделать",
    расказать: "рассказать",
    рускій: "русский",
    руский: "русский",
    поже: "позже",
    вообщето: "вообще-то",
    наврятли: "навряд ли",
    вобще: "вообще",
    щас: "сейчас",
    че: "чё",
    // Английский
    teh: "the",
    recieve: "receive",
    seperate: "separate",
    definately: "definitely",
    occured: "occurred",
    wich: "which",
    alot: "a lot",
    untill: "until",
    beleive: "believe",
    tommorow: "tomorrow",
  })
);

// Ставит заглавную первую букву, если у исходного слова она была заглавной.
function matchCase(replacement, original) {
  if (original[0] && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Не трогаем то, что похоже на ссылку/почту/упоминание/хэштег: там «ошибки»
// (например, точка без пробела) — часть адреса, а не опечатка.
function protectedRanges(text) {
  const ranges = [];
  const RE = /(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.-]+|[@#]\w+)/g;
  for (const m of text.matchAll(RE)) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function localProofread(text) {
  const src = String(text ?? "");
  if (!src.trim()) return [];
  const protectedR = protectedRanges(src);
  const isProtected = (offset, length) => protectedR.some(([a, b]) => offset < b && offset + length > a);
  const matches = [];
  const add = (offset, length, replacement, message, short, type = "typo") => {
    if (isProtected(offset, length)) return;
    matches.push({ offset, length, replacements: replacement == null ? [] : [replacement], message, short, type });
  };

  // Словарь опечаток.
  for (const m of src.matchAll(/\p{L}+/gu)) {
    const fix = WORD_FIXES.get(m[0].toLowerCase());
    if (fix) add(m.index, m[0].length, matchCase(fix, m[0]), `Опечатка: «${m[0]}» → «${matchCase(fix, m[0])}»`, "Опечатка", "misspelling");
  }

  // Повтор слова подряд: «что что» → «что».
  for (const m of src.matchAll(/(\p{L}{2,})(\s+)(\1)(?!\p{L})/giu)) {
    add(m.index, m[0].length, m[1], `Повтор слова: «${m[1]}»`, "Повтор слова", "duplication");
  }

  // Двойные пробелы → один.
  for (const m of src.matchAll(/ {2,}/g)) {
    add(m.index, m[0].length, " ", "Лишний пробел", "Лишний пробел", "typography");
  }

  // Пробел перед знаком препинания: «слово ,» → «слово,».
  for (const m of src.matchAll(/[ \t]+([,.!?;:])/g)) {
    add(m.index, m[0].length, m[1], `Лишний пробел перед «${m[1]}»`, "Пробел перед знаком", "typography");
  }

  // Пропущен пробел после знака: «привет,как» → «привет, как». Точку не трогаем
  // (числа, инициалы, сокращения), только , ! ? ; :.
  for (const m of src.matchAll(/([,!?;:])(\p{L})/gu)) {
    add(m.index, 2, `${m[1]} ${m[2]}`, `Нужен пробел после «${m[1]}»`, "Пробел после знака", "typography");
  }

  // Дефис между пробелами почти всегда должен быть тире: «текст - текст» →
  // «текст — текст». Дефис внутри слова («кто-то») не трогаем — там нет пробелов.
  for (const m of src.matchAll(/( )[-–](?= )/g)) {
    add(m.index, m[0].length, `${m[1]}—`, "Дефис вместо тире", "Тире", "typography");
  }

  return matches;
}

module.exports = { localProofread };
