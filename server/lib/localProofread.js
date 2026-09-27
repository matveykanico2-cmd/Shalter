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
    зделаю: "сделаю",
    расказать: "рассказать",
    руский: "русский",
    рускый: "русский",
    поже: "позже",
    вообщето: "вообще-то",
    наврятли: "навряд ли",
    вобще: "вообще",
    щас: "сейчас",
    // Частые опечатки/ошибки (высокая уверенность, без контекста)
    здраствуй: "здравствуй",
    здраствуйте: "здравствуйте",
    спосибо: "спасибо",
    пожалуста: "пожалуйста",
    пожалустта: "пожалуйста",
    конешно: "конечно",
    конечено: "конечно",
    потомучто: "потому что",
    тоесть: "то есть",
    какбудто: "как будто",
    всеравно: "всё равно",
    всёравно: "всё равно",
    какраз: "как раз",
    чтоли: "что ли",
    естесственно: "естественно",
    интерессно: "интересно",
    интерестно: "интересно",
    рассписание: "расписание",
    росписание: "расписание",
    програма: "программа",
    акаунт: "аккаунт",
    оффис: "офис",
    адресс: "адрес",
    килограм: "килограмм",
    будеш: "будешь",
    можеш: "можешь",
    хочеш: "хочешь",
    знаеш: "знаешь",
    делаеш: "делаешь",
    пойдеш: "пойдёшь",
    хочю: "хочу",
    прийдёт: "придёт",
    прийдет: "придёт",
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
    tomorow: "tomorrow",
    adress: "address",
    begining: "beginning",
    succesful: "successful",
    enviroment: "environment",
    goverment: "government",
    accross: "across",
    tigth: "tight",
    freind: "friend",
    wierd: "weird",
  })
);

// Латинские буквы, у которых есть кириллический близнец, — для починки слов,
// где случайно затесалась латиница («пpивет» с латинской p).
const LATIN_TO_CYR = {
  a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у", k: "к", b: "в", m: "м", h: "н", t: "т",
  A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У",
};
const CYR_RE = /[Ѐ-ӿ]/;
const LAT_RE = /[A-Za-z]/;

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

  // Смешанная раскладка: в кириллическом слове затесались латинские буквы-
  // двойники («пpивет» с латинской p). Чиним только если ВСЕ латинские буквы
  // слова имеют кириллический двойник — иначе это осознанная латиница.
  for (const m of src.matchAll(/\p{L}+/gu)) {
    const w = m[0];
    if (!CYR_RE.test(w) || !LAT_RE.test(w)) continue;
    const latin = [...w].filter((ch) => LAT_RE.test(ch));
    if (!latin.every((ch) => ch in LATIN_TO_CYR)) continue;
    const fixed = [...w].map((ch) => (LAT_RE.test(ch) ? LATIN_TO_CYR[ch] : ch)).join("");
    add(m.index, w.length, fixed, `Смешанная раскладка: «${w}» → «${fixed}»`, "Раскладка", "misspelling");
  }

  // Повтор буквы 4+ раз подряд — почти всегда опечатка: «приветттт» → «привет».
  // 4+, а не 3+, чтобы не трогать слова с тремя одинаковыми (длинношеее).
  for (const m of src.matchAll(/(\p{L})\1{3,}/giu)) {
    add(m.index, m[0].length, m[1], "Лишний повтор буквы", "Повтор буквы", "typo");
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
