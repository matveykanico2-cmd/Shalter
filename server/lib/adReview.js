const { ADMIN_PHONE } = require("../config");
const { getUser, findUserByPhone } = require("../data/users");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { SYSTEM_BOT_ID } = require("../data/systemBot");

async function notifyAdminOfReview(campaign, ownerId) {
  try {
    const admin = await findUserByPhone(ADMIN_PHONE);
    if (!admin || admin.id === ownerId) return;
    const owner = await getUser(ownerId);
    const chat = await findOrCreateDm(SYSTEM_BOT_ID, admin.id);
    await sendMessageAndBroadcast(
      chat,
      SYSTEM_BOT_ID,
      `📢 Объявление на проверку от ${owner?.name ?? "пользователя"}\n«${campaign.title || "Без названия"}»\n${campaign.text}` +
        (campaign.url ? `\nСсылка: ${campaign.url}` : "") +
        "\n\nПроверить: Настройки → Модерация → Реклама на проверке."
    );
  } catch (err) {
    console.error("ad review notice failed:", err);
  }
}

module.exports = { notifyAdminOfReview };
