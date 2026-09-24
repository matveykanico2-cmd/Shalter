// Ephemeral typing presence — no persistence needed, entries self-expire.
//
// Не только «печатает»: как в Telegram, собеседник видит, что именно сейчас
// происходит — записывается голосовое или кружок, уходит фото, видео, файл.
// Названия действий те же, что у sendChatAction в Telegram Bot API, чтобы
// боты (routes/botApi.js) могли слать их без перевода.
const TTL_MS = 4000;

const ACTIONS = new Set([
  "typing",
  "choose_sticker",
  "upload_photo",
  "record_video",
  "upload_video",
  "record_voice",
  "upload_voice",
  "upload_document",
  "record_video_note",
  "upload_video_note",
]);

// Неизвестное действие — это всё равно признак жизни, поэтому «печатает», а
// не отказ: старый клиент без поля action шлёт именно это.
function normalizeAction(action) {
  return ACTIONS.has(action) ? action : "typing";
}

const typingByChatId = new Map();

function markTyping(chatId, userId, action = "typing") {
  typingByChatId.set(chatId, { userId, action: normalizeAction(action), expiresAt: Date.now() + TTL_MS });
}

// Запись отменили или загрузка кончилась — статус снимается сразу, а не
// через четыре секунды: «записывает голосовое» над удалённой записью вводит
// в заблуждение.
function clearTyping(chatId, userId) {
  const entry = typingByChatId.get(chatId);
  if (entry && entry.userId === userId) typingByChatId.delete(chatId);
}

function getTyping(chatId, viewerId) {
  const entry = typingByChatId.get(chatId);
  if (!entry || entry.expiresAt < Date.now() || entry.userId === viewerId) return null;
  return { userId: entry.userId, action: entry.action };
}

function getTypingUserId(chatId, viewerId) {
  return getTyping(chatId, viewerId)?.userId ?? null;
}

module.exports = { markTyping, clearTyping, getTyping, getTypingUserId, normalizeAction };
