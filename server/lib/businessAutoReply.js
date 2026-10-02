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
    if (!recipientId || recipientId === message.senderId) return;

    const recipient = await getUser(recipientId);
    if (!recipient?.isBusiness) return;
    const settings = await getSettings(recipientId);
    const business = settings.business;
    if (!business?.enabled) return;

    const has = (m) => !!(m?.text || m?.attachments?.length);

    if (business.greeting?.enabled && has(business.greeting) && !alreadySent(chat.id, "greeting", "once")) {
      await sendMessageAndBroadcast(chat, recipientId, business.greeting.text || "", { attachments: business.greeting.attachments });
      markSent(chat.id, "greeting", "once");
      return;
    }

    if (business.away?.enabled && has(business.away) && !isWithinBusinessHours(business.hours, business.timeZone)) {
      const today = localNow(business.timeZone).date;
      if (!alreadySent(chat.id, "away", today)) {
        await sendMessageAndBroadcast(chat, recipientId, business.away.text || "", { attachments: business.away.attachments });
        markSent(chat.id, "away", today);
      }
    }
  } catch (err) {
    console.error("business auto-reply failed:", err);
  }
}

module.exports = { dispatchBusinessAutoReply, isWithinBusinessHours };
