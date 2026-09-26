// Авторитетная проверка фона подарка (выбирается при отправке — см.
// public/js/lib/giftBackground.js и components/giftShopDialog.js).
//
// Фон — две hex-точки радиального градиента или ничего. Он пользовательский и
// уходит в чужой чат/на профиль, поэтому цвета пинуются здесь строго к hex,
// ровно как сцена (lib/sanitizeScene.js): в стиль на клиенте попадёт только то,
// что прошло отсюда.

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hex = (v) => (typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

function sanitizeGiftBackground(bg) {
  if (!bg || typeof bg !== "object") return null;
  const from = hex(bg.from);
  const to = hex(bg.to);
  if (!from || !to) return null;
  return { from, to };
}

module.exports = { sanitizeGiftBackground };
