// Признаки коллекционного подарка: модель, фон и узор с редкостью каждого.
//
// В телеграме у коллекционного подарка три свойства с процентом редкости — из
// них и складывается «этот экземпляр не такой, как соседний». У нас подарок
// отличался от соседнего только номером (№3 из 10), и карточка выглядела
// пустовато.
//
// Свойства не хранятся, а выводятся из пары «подарок + номер экземпляра»:
// один и тот же №3 «Розы» всегда даст одну и ту же модель и один и тот же фон,
// на любом устройстве и после любого перезапуска, — а хранить нечего и нечему
// разъезжаться. Редкость при этом не выдумывается на ходу: она записана рядом
// с вариантом и служит его весом при выборе, поэтому «Virus 4%» действительно
// встречается вчетверо реже, чем вариант с 16%.

const MODELS = [
  { name: "Обычная", rarity: 40 },
  { name: "Морозная", rarity: 18 },
  { name: "Закатная", rarity: 14 },
  { name: "Неоновая", rarity: 10 },
  { name: "Золотая", rarity: 8 },
  { name: "Уютный космос", rarity: 5 },
  { name: "Вирус", rarity: 3 },
  { name: "Затмение", rarity: 2 },
];

const BACKDROPS = [
  { name: "Молочный", rarity: 30, colors: ["#f6d9e7", "#e7c3f0"] },
  { name: "Мятный", rarity: 20, colors: ["#c8f0e2", "#a5d8f3"] },
  { name: "Персиковый", rarity: 16, colors: ["#ffd8b0", "#ffb3c1"] },
  { name: "Электрик", rarity: 12, colors: ["#a78bfa", "#7c3aed"] },
  { name: "Кобальт", rarity: 9, colors: ["#5b8def", "#2b3fa0"] },
  { name: "Изумруд", rarity: 7, colors: ["#34d399", "#059669"] },
  { name: "Пурпур", rarity: 4, colors: ["#f472b6", "#7e22ce"] },
  { name: "Оникс", rarity: 2, colors: ["#4b5563", "#111827"] },
];

const SYMBOLS = [
  { name: "Сердце", rarity: 26, glyph: "❤️" },
  { name: "Звезда", rarity: 20, glyph: "⭐" },
  { name: "Дельфин", rarity: 15, glyph: "🐬" },
  { name: "Молния", rarity: 12, glyph: "⚡" },
  { name: "Перо", rarity: 10, glyph: "🪶" },
  { name: "Чили", rarity: 8, glyph: "🌶️" },
  { name: "Комета", rarity: 6, glyph: "☄️" },
  { name: "Корона", rarity: 3, glyph: "👑" },
];

// Небольшая устойчивая хеш-функция: одна и та же строка всегда даёт одно и то
// же число. Math.random() здесь не подходит принципиально — свойства должны
// совпадать у отправителя и получателя, а не быть разными при каждом открытии.
function hash(str, salt) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

// Выбор с весами: редкий вариант и должен выпадать редко, иначе процент рядом с
// названием — просто украшение.
function pick(list, roll) {
  const total = list.reduce((sum, item) => sum + item.rarity, 0);
  let point = roll * total;
  for (const item of list) {
    point -= item.rarity;
    if (point <= 0) return item;
  }
  return list[list.length - 1];
}

export function giftTraits(gift) {
  const seed = `${gift?.giftId ?? gift?.id ?? gift?.emoji ?? "gift"}#${gift?.serial ?? 0}`;
  return {
    model: pick(MODELS, hash(seed, 1)),
    backdrop: pick(BACKDROPS, hash(seed, 2)),
    symbol: pick(SYMBOLS, hash(seed, 3)),
  };
}
