// Static catalog — no inventory/stock to track, gifts are purely decorative
// (or a Premium duration) messages, not a real item. `premiumDays: null`
// means "forever" (see server/data/users.js's grantPremiumDays). Prices are
// illustrative (see server/routes/gifts.js — payment is a real bank
// transfer to ADMIN_PHONE, same trust model as the plain Premium purchase).
const GIFTS = [
  { id: "rose", emoji: "🌹", name: "Роза", priceRub: 1, premiumDays: 0 },
  { id: "coffee", emoji: "☕", name: "Кофе", priceRub: 5, premiumDays: 0 },
  { id: "heart", emoji: "❤️", name: "Сердце", priceRub: 10, premiumDays: 0 },
  { id: "cake", emoji: "🎂", name: "Торт", priceRub: 25, premiumDays: 0 },
  { id: "ring", emoji: "💍", name: "Кольцо", priceRub: 50, premiumDays: 0 },
  { id: "premium_week", emoji: "⭐", name: "Premium на неделю", priceRub: 100, premiumDays: 7 },
  { id: "premium_month", emoji: "👑", name: "Premium на месяц", priceRub: 300, premiumDays: 30 },
  { id: "premium_quarter", emoji: "💎", name: "Premium на 3 месяца", priceRub: 1000, premiumDays: 90 },
  { id: "premium_year", emoji: "🏆", name: "Premium на год", priceRub: 5000, premiumDays: 365 },
  { id: "premium_forever", emoji: "♾️", name: "Premium навсегда", priceRub: 10000, premiumDays: null },
];

function listGifts() {
  return GIFTS;
}

function getGift(id) {
  return GIFTS.find((g) => g.id === id);
}

module.exports = { listGifts, getGift };
