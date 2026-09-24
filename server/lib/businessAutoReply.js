// Shalter для бизнеса — приветствие новому собеседнику и автоответ вне часов
// работы, для DM. Called fire-and-forget from routes/messages.js right after
// the Hugo/helper-bot dispatches, same "never throws, never delays the
// sender" shape as those.
//
// Greeting fires once ever per chat (business_auto_replies_sent's
// (chatId,"greeting","once") row); away fires at most once per calendar day
// per chat ((chatId,"away",<today's date>)) — a customer writing five times
// in one evening outside business hours gets the away message once, not five
// times. «Рабочее ли сейчас время» и «какой сегодня день» считаются по
// часовому поясу бизнеса (settings.business.timeZone, lib/businessHours.js);
// у старых настроек без пояса — по поясу сервера, как раньше.
const db = require("../db");
const { getUser } = require("../data/users");
const { getSettings } = require("../data/settings");
const { sendMessageAndBroadcast } = require("./systemChat");
const { isWithinBusinessHours, localNow } = require("./businessHours");

function alreadySent(chatId, kind, sentDate) {
  return !!db
    .prepare("SELECT 1 FROM business_auto_replies_sent WHERE chatId = ? AND kind = ? AND sentDate = ?")
    .get(chatId, kind, sentDate);
}

function markSent(chatId, kind, sentDate) {
  db.prepare(
    "INSERT OR IGNORE INTO business_auto_replies_sent (chatId, kind, sentDate, sentAt) VALUES (?, ?, ?, ?)"
  ).run(chatId, kind, sentDate, new Date().toISOString());
}

async function dispatchBusinessAutoReply(chat, message) {
  try {
    if (chat.type !== "dm" || message.type !== "text" || !message.text?.trim()) return;
    const recipientId = chat.memberIds.find((id) => id !== message.senderId);
    if (!recipientId || recipientId === message.senderId) return; // self-chat, or malformed DM

    const recipient = await getUser(recipientId);
    if (!recipient?.isBusiness) return;
    const settings = await getSettings(recipientId);
    const business = settings.business;
    if (!business?.enabled) return;

    if (business.greeting?.enabled && business.greeting.text && !alreadySent(chat.id, "greeting", "once")) {
      await sendMessageAndBroadcast(chat, recipientId, business.greeting.text);
      markSent(chat.id, "greeting", "once");
      return; // приветствие уже отвечает на первое сообщение — автоответ вне часов в тот же раз ни к чему
    }

    if (business.away?.enabled && business.away.text && !isWithinBusinessHours(business.hours, business.timeZone)) {
      // «Раз в день» — в сутках бизнеса, а не UTC: иначе в Москве новый
      // день для автоответа наступал бы в три часа ночи.
      const today = localNow(business.timeZone).date;
      if (!alreadySent(chat.id, "away", today)) {
        await sendMessageAndBroadcast(chat, recipientId, business.away.text);
        markSent(chat.id, "away", today);
      }
    }
  } catch (err) {
    console.error("business auto-reply failed:", err);
  }
}

module.exports = { dispatchBusinessAutoReply, isWithinBusinessHours };
