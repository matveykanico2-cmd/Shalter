const WORD_FIXES = new Map(
  Object.entries({
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

const LATIN_TO_CYR = {
  a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у", k: "к", b: "в", m: "м", h: "н", t: "т",
  A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У",
};
const CYR_RE = /[Ѐ-ӿ]/;
const LAT_RE = /[A-Za-z]/;

const RU_WORDS = `
привет здравствуй здравствуйте пока спасибо пожалуйста извини извините прости простите
да нет ага угу конечно ладно хорошо плохо отлично супер класс круто нормально
как что кто где когда куда откуда почему зачем сколько какой какая какое какие
я ты он она оно мы вы они меня тебя его её нас вас их мне тебе ему ей нам вам им
это этот эта эти тот та те там тут здесь сейчас потом теперь всегда никогда иногда часто редко
сегодня завтра вчера утро день вечер ночь утром днём вечером ночью
человек люди друг подруга друзья семья мама папа брат сестра сын дочь ребёнок дети жена муж
дом квартира комната работа школа университет магазин улица город страна мир
вода еда хлеб молоко чай кофе сок мясо рыба суп каша яйцо сыр масло сахар соль
корова кошка кот собака птица рыбка лошадь
машина телефон компьютер интернет сообщение письмо звонок фото видео музыка книга
деньги рубль доллар цена дорого дёшево купить продать заказ доставка
время час минута секунда неделя месяц год сегодняшний
погода солнце дождь снег ветер тепло холодно жарко мороз
идти пойти прийти ходить бежать ехать поехать лететь плыть
делать сделать говорить сказать думать знать понимать хотеть мочь любить нравиться
видеть смотреть слышать слушать читать писать работать отдыхать спать есть пить
жить дать взять брать давать получить отправить ответить спросить помочь
большой маленький новый старый молодой красивый хороший плохой быстрый медленный
белый чёрный красный синий зелёный жёлтый добрый злой умный весёлый грустный
очень слишком просто сложно можно нужно надо нельзя вообще совсем почти
и а но или если чтобы потому что тоже также ещё уже только даже вот
здорово помоги помогите давай пойдём смотри слушай понял поняла знаю думаю
`.split(/\s+/).filter(Boolean);
const EN_WORDS = `the a an and or but if then this that these those is are was were be been being
i you he she it we they me him her us them my your his its our their
hello hi hey bye thanks thank please sorry yes no okay ok sure yeah
what who where when why how which now today tomorrow yesterday
have has had do does did make made get got go went come came see saw know knew think
good bad new old big small nice great cool people friend family work home time day
water food money phone message hello world write read speak listen love like want need
because about with without from into over under again very just only even still`
  .split(/\s+/)
  .filter(Boolean);
const DICT = new Set([...RU_WORDS, ...EN_WORDS]);

function editDistance(a, b, max) {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prev = Array.from({ length: bl + 1 }, (_, j) => j);
  let prevPrev = [];
  for (let i = 1; i <= al; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prevPrev[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[bl];
}

function suggestWord(word) {
  const lower = word.toLowerCase();
  const max = lower.length <= 4 ? 1 : 2;
  const found = [];
  for (const w of DICT) {
    if (Math.abs(w.length - lower.length) > max) continue;
    const d = editDistance(lower, w, max);
    if (d <= max) found.push([d, w]);
  }
  found.sort((a, b) => a[0] - b[0]);
  return found.slice(0, 3).map(([, w]) => w);
}

function matchCase(replacement, original) {
  if (original[0] && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

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
    const replacements = Array.isArray(replacement) ? replacement : replacement == null ? [] : [replacement];
    matches.push({ offset, length, replacements, message, short, type });
  };

  for (const m of src.matchAll(/\p{L}+/gu)) {
    const fix = WORD_FIXES.get(m[0].toLowerCase());
    if (fix) add(m.index, m[0].length, matchCase(fix, m[0]), `Опечатка: «${m[0]}» → «${matchCase(fix, m[0])}»`, "Опечатка", "misspelling");
  }

  for (const m of src.matchAll(/\p{L}+/gu)) {
    const w = m[0];
    if (w.length < 5 || /\d/.test(w)) continue;
    if (!CYR_RE.test(w) || LAT_RE.test(w)) continue;
    if (w[0] !== w[0].toLowerCase()) continue;
    const lower = w.toLowerCase();
    if (DICT.has(lower) || WORD_FIXES.has(lower)) continue;
    const sug = suggestWord(w);
    if (sug.length) {
      const best = sug[0];
      let common = 0;
      while (common < lower.length && common < best.length && lower[common] === best[common]) common++;
      if (common < Math.min(lower.length, best.length) - 2) {
        const fixes = sug.map((s) => matchCase(s, w));
        add(m.index, w.length, fixes, `Возможная ошибка: «${w}» → «${fixes[0]}»`, "Орфография", "misspelling");
      }
    }
  }

  for (const m of src.matchAll(/\p{L}+/gu)) {
    const w = m[0];
    if (!CYR_RE.test(w) || !LAT_RE.test(w)) continue;
    const latin = [...w].filter((ch) => LAT_RE.test(ch));
    if (!latin.every((ch) => ch in LATIN_TO_CYR)) continue;
    const fixed = [...w].map((ch) => (LAT_RE.test(ch) ? LATIN_TO_CYR[ch] : ch)).join("");
    add(m.index, w.length, fixed, `Смешанная раскладка: «${w}» → «${fixed}»`, "Раскладка", "misspelling");
  }

  for (const m of src.matchAll(/(\p{L})\1{3,}/giu)) {
    add(m.index, m[0].length, m[1], "Лишний повтор буквы", "Повтор буквы", "typo");
  }

  for (const m of src.matchAll(/(\p{L}{2,})(\s+)(\1)(?!\p{L})/giu)) {
    add(m.index, m[0].length, m[1], `Повтор слова: «${m[1]}»`, "Повтор слова", "duplication");
  }

  for (const m of src.matchAll(/ {2,}/g)) {
    add(m.index, m[0].length, " ", "Лишний пробел", "Лишний пробел", "typography");
  }

  for (const m of src.matchAll(/[ \t]+([,.!?;:])/g)) {
    add(m.index, m[0].length, m[1], `Лишний пробел перед «${m[1]}»`, "Пробел перед знаком", "typography");
  }

  for (const m of src.matchAll(/([,!?;:])(\p{L})/gu)) {
    add(m.index, 2, `${m[1]} ${m[2]}`, `Нужен пробел после «${m[1]}»`, "Пробел после знака", "typography");
  }

  for (const m of src.matchAll(/( )[-–](?= )/g)) {
    add(m.index, m[0].length, `${m[1]}—`, "Дефис вместо тире", "Тире", "typography");
  }

  return matches;
}

module.exports = { localProofread };
