// Текст, набранный в английской раскладке вместо русской («ghbdtn» → «привет»).
// Признак: в латинице почти нет гласных (русские гласные на этих клавишах —
// f t b j e s ' . z ...), нет обычных английских слов, а после перевода
// раскладки получается текст с нормальной долей русских гласных.
const EN = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./~QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>?@#$^&";
const RU = "ёйцукенгшщзхъфывапролджэячсмитьбю.ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,\"№;:?";
const MAP = new Map([...EN].map((c, i) => [c, RU[i]]));
const EN_WORDS = /\b(the|and|you|is|are|what|how|draw|hello|hi|please|this|that|with|for|can|me|my|it|of|to|in|on|a|i)\b/i;

function convert(text) {
  return [...text].map((c) => MAP.get(c) ?? c).join("");
}

function vowelShare(s, re) {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => re.test(c)).length / letters.length;
}

// Возвращает исправленный текст или null, если раскладка, похоже, правильная.
function fixLayout(text) {
  const t = String(text ?? "").trim();
  if (t.length < 3 || /[а-яё]/i.test(t) || /^[\/@]/.test(t) || /https?:\/\//i.test(t)) return null;
  const words = t.match(/[A-Za-z;',.\[\]`]+/g) ?? [];
  if (!words.length) return null;
  if (words.some((w) => EN_WORDS.test(w)) && vowelShare(t, /[aeiouy]/i) > 0.25) return null;
  const latinVowels = vowelShare(t, /[aeiouy]/i);
  const fixed = convert(t);
  const ruVowels = vowelShare(fixed, /[аеёиоуыэюя]/i);
  return latinVowels < 0.3 && ruVowels > 0.28 && ruVowels < 0.7 ? fixed : null;
}

module.exports = { fixLayout, convertLayout: convert };
