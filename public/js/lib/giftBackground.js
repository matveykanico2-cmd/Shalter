// Фон подарка — то, что выбирают при отправке (components/giftShopDialog.js) и
// что рисуется за подарком на карточке в чате и на полке профиля.
//
// Фон — это две hex-точки радиального градиента (или ничего). Пользователь
// может взять готовый пресет или подкрутить оба цвета сам. Как и у сцены
// (lib/customScene.js), это ДАННЫЕ, а не разметка: цвета — только hex, а стиль
// собирается здесь из проверенных значений, поэтому фоном нельзя ничего
// протащить. Авторитетная проверка — на сервере (server/lib/giftBackground.js).

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Готовые фоны — «выбрать нужный». id пустой у «без фона».
export const GIFT_BACKGROUNDS = [
  { id: "", label: "Без фона", from: null, to: null },
  { id: "gold", label: "Золото", from: "#ffe08a", to: "#c8860b" },
  { id: "rose", label: "Роза", from: "#ffd9e3", to: "#ff5d73" },
  { id: "sky", label: "Небо", from: "#c9ecff", to: "#3aa0ff" },
  { id: "mint", label: "Мята", from: "#c8f7dc", to: "#28b667" },
  { id: "grape", label: "Виноград", from: "#e5d4ff", to: "#8b5cf6" },
  { id: "ember", label: "Уголь", from: "#ffb37a", to: "#e0453a" },
  { id: "night", label: "Ночь", from: "#5b6b9a", to: "#141a2e" },
];

const hex = (v) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

// Приводит фон к { from, to } из двух hex или к null. Тот же разбор, что на
// сервере: клиент не должен собрать то, что сервер потом отвергнет.
export function sanitizeGiftBackground(bg) {
  if (!bg || typeof bg !== "object") return null;
  const from = hex(bg.from);
  const to = hex(bg.to);
  if (!from || !to) return null;
  return { from, to };
}

// CSS-градиент фона или null. Значения уже проверены, в строку идут только hex.
export function giftBackgroundStyle(bg) {
  const clean = sanitizeGiftBackground(bg);
  return clean ? `radial-gradient(circle at 50% 40%, ${clean.from}, ${clean.to})` : null;
}
