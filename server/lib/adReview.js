const { ADMIN_PHONE } = require("../config");
const { getUser, findUserByPhone } = require("../data/users");
const { findOrCreateDm, sendMessageAndBroadcast } = require("./systemChat");
const { SYSTEM_BOT_ID } = require("../data/systemBot");

// Отправили объявление на проверку — администрация должна узнать сразу, а не
// при следующем заходе в «Модерацию»: на той стороне человек ждёт ответа,
// чтобы начать показ (и уже потратил на кампанию звёзды).
//
// Живёт в lib, а не в routes/ads.js, потому что кампанию заводит не только
// рекламный кабинет: продавец маркета жмёт «Рекламировать» у себя в магазине
// (routes/market.js), и та кампания обязана попасть в ту же очередь проверки.
async function notifyAdminOfReview(campaign, ownerId) {
  try {
    const admin = await findUserByPhone(ADMIN_PHONE);
    // Свою же кампанию администратор видит в очереди и без сообщения самому
    // себе — та же логика, что у /request в routes/ads.js.
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
