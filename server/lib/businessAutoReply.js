// Shalter для бизнеса — приветствие новому собеседнику и автоответ вне часов
// работы, для DM. Called fire-and-forget from routes/messages.js right after
// the Hugo/helper-bot dispatches, same "never throws, never delays the
// sender" shape as those.
//
// Greeting fires once ever per chat (business_auto_replies_sent's
// (chatId,"greeting","once") row); away fires at most once per calendar day
// per chat ((chatId,"away",<today's date>)) — a customer writing five times
// in one evening outside business hours gets the away message once, not five
// times. Server local time decides "is it business hours" — there's no
// per-account timezone field (see server/data/settings.js's `business`
// comment), same simplification lib/holidaySweep.js already makes.
const db = require("../db");
const { getUser } = require("../data/users");
const { getSettings } = require("../data/settings");
const { sendMessageAndBroadcast } = require("./systemChat");

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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

function isWithinBusinessHours(hours) {
  const now = new Date();
  const day = DAY_KEYS[(now.getDay() + 6) % 7]; // Date#getDay(): 0=Sunday
  const today = hours?.[day];
  if (!today || today.closed) return false;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return hm >= today.open && hm < today.close;
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

    if (business.away?.enabled && business.away.text && !isWithinBusinessHours(business.hours)) {
      const today = new Date().toISOString().slice(0, 10);
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
