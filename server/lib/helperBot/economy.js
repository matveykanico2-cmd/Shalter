const { balanceOf, addStars } = require("../../data/stars");
const { getUser } = require("../../data/users");
const { msUntilNextClaim, recordClaim } = require("../../data/dailyBonus");

const DAILY_REWARD = 20;

function formatMs(ms) {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours} ч ${minutes} мин`;
}

const commands = {
  async balance(ctx) {
    return `⭐ Ваш баланс: ${balanceOf(ctx.senderId)} звёзд.`;
  },

  async daily(ctx) {
    const wait = msUntilNextClaim(ctx.senderId);
    if (wait > 0) return `⏳ Бонус уже получен. Следующий — через ${formatMs(wait)}.`;
    recordClaim(ctx.senderId);
    const balance = addStars(ctx.senderId, DAILY_REWARD);
    return `🎁 Ежедневный бонус: +${DAILY_REWARD} ⭐\nБаланс: ${balance} звёзд.`;
  },

  async invite(ctx) {
    const user = await getUser(ctx.senderId);
    if (!user?.referralCode) return "Реферальная ссылка недоступна — загляните в Настройки → Premium и друзья.";
    return `👥 Пригласите друга по своей ссылке — Premium на 30 дней получите оба!\n\nКод: ${user.referralCode}`;
  },

  async ref(ctx) {
    return commands.invite(ctx);
  },

  async shop() {
    return "🛍 Магазин подарков — Настройки → Premium и друзья → «Магазин подарков». Пакеты звёзд — Настройки → Звёзды.";
  },

  async donate() {
    return "💛 Поддержать проект — Настройки → Звёзды → выберите набор и переведите администрации. Спасибо!";
  },
};

module.exports = { commands };
