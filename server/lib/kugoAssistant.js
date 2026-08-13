// Generates Kugo AI's reply to a user message and posts it back into the DM.
// Wired into routes/messages.js's deliverMessage: whenever a chat Kugo is a
// member of receives a message from a human, this runs (fire-and-forget, so a
// slow model call never delays the human's own send).
const { KUGO_AI_ID, KUGO_SYSTEM_PROMPT } = require("../data/kugoAssistant");
const { listMessages } = require("../data/messages");
const { getUser } = require("../data/users");
const { sendMessageAndBroadcast } = require("./systemChat");
const { askAIConversation } = require("./ai");

// How many prior messages to feed the model as context. Enough to remember
// the thread of the conversation without sending the entire (potentially
// huge) history on every turn — the DM with an assistant tends to stay short.
const HISTORY_LIMIT = 20;

// Per-user rate limit. Kugo calls a real, metered API on the server's own
// key, so — same reasoning as ai.js's per-bot limit — one user hammering the
// assistant shouldn't be able to run up an unbounded bill. In-memory Map of
// timestamps keyed by user id (per-process, fine for this single-process app
// — see AGENTS.md).
const WINDOW_MS = 60_000;
const MAX_REPLIES_PER_WINDOW = 10;
const callTimestampsByUserId = new Map();

function overRateLimit(userId) {
  const now = Date.now();
  const stamps = (callTimestampsByUserId.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length >= MAX_REPLIES_PER_WINDOW) return true;
  stamps.push(now);
  callTimestampsByUserId.set(userId, stamps);
  return false;
}

// chat: the DM/group Kugo is in. humanSenderId: whoever just wrote. Returns
// nothing — posts the reply itself (or a friendly error message).
async function replyAsKugo(chat, humanSenderId) {
  if (overRateLimit(humanSenderId)) {
    await sendMessageAndBroadcast(chat, KUGO_AI_ID, "Слишком много запросов подряд — подождите минуту и спросите снова 🙏");
    return;
  }

  // Build the conversation from stored history so Kugo has context. Map each
  // message to a Claude turn: Kugo's own messages are the "assistant" role,
  // everyone else is "user". Skip empty/attachment-only messages (the model
  // can't see attachments here — this is a text assistant).
  const history = (await listMessages(chat.id, KUGO_AI_ID)).slice(-HISTORY_LIMIT);
  const turns = [];
  for (const m of history) {
    const text = (m.text ?? "").trim();
    if (!text) continue;
    const role = m.senderId === KUGO_AI_ID ? "assistant" : "user";
    // The Messages API requires the first turn to be "user" and generally
    // alternating roles — collapse consecutive same-role messages into one
    // turn so a run of user messages (or Kugo's own) doesn't 400.
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += "\n" + text;
    else turns.push({ role, content: text });
  }
  // Drop any leading assistant turns so the array starts with a user turn.
  while (turns.length && turns[0].role === "assistant") turns.shift();
  if (turns.length === 0) return;

  let reply;
  try {
    reply = await askAIConversation(turns, { system: KUGO_SYSTEM_PROMPT, maxTokens: 1024 });
  } catch (err) {
    // Surface the real reason for the two most common misconfigurations
    // (no key, or the model refused/errored) rather than a silent non-reply.
    const msg = /не настроен/.test(err.message)
      ? "ИИ-ассистент пока не подключён на этом сервере (администратору нужно задать ANTHROPIC_API_KEY)."
      : "Не удалось получить ответ от ИИ — попробуйте ещё раз чуть позже.";
    await sendMessageAndBroadcast(chat, KUGO_AI_ID, msg);
    console.error("Kugo reply failed:", err.message);
    return;
  }

  if (reply) await sendMessageAndBroadcast(chat, KUGO_AI_ID, reply);
}

// True if this chat should get a Kugo reply for a message from humanSenderId:
// Kugo is a member, and the sender isn't Kugo itself (never reply to its own
// messages — that'd loop forever).
function shouldKugoReply(chat, humanSenderId) {
  return humanSenderId !== KUGO_AI_ID && chat.memberIds.includes(KUGO_AI_ID);
}

module.exports = { replyAsKugo, shouldKugoReply };
