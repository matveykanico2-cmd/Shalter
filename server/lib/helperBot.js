// The slash-command bot's dispatcher. Unlike Hugo (lib/hugoBot.js), this one
// answers in any chat and doesn't require being a chat member — see
// data/helperBot.js for why. Called fire-and-forget from routes/messages.js,
// same shape as dispatchHugo: never throws, never delays the human sender's
// own request.
const { HELPER_BOT_ID } = require("../data/helperBot");
const { sendMessageAndBroadcast } = require("./systemChat");
const { getPending } = require("./helperBot/pendingState");
const info = require("./helperBot/info");
const moderation = require("./helperBot/moderation");
const economy = require("./helperBot/economy");
const fun = require("./helperBot/fun");
const utility = require("./helperBot/utility");

const COMMANDS = {
  ...info.commands,
  ...moderation.commands,
  ...economy.commands,
  ...fun.commands,
  ...utility.commands,
};

// Command name may be Cyrillic-adjacent in theory, but every command in the
// registry is plain ASCII — kept simple on purpose. "@botname" suffix
// (Telegram-style, /help@helper) is accepted and ignored.
const COMMAND_RE = /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/;

function buildCtx(chat, message, argsText) {
  const args = (argsText ?? "").trim();
  return {
    chat,
    message,
    senderId: message.senderId,
    chatId: chat.id,
    args,
    argv: args.length ? args.split(/\s+/) : [],
  };
}

async function reply(chat, result) {
  if (!result) return;
  const text = typeof result === "string" ? result : result.text ?? "";
  const extra = typeof result === "string" ? {} : { attachments: result.attachments, keyboard: result.keyboard };
  if (!text && !extra.attachments) return;
  await sendMessageAndBroadcast(chat, HELPER_BOT_ID, text, extra);
}

async function dispatchHelperBot(chat, message) {
  try {
    if (message.senderId === HELPER_BOT_ID) return;
    if (message.type !== "text" || !message.text?.trim()) return;
    const trimmed = message.text.trim();

    const match = COMMAND_RE.exec(trimmed);
    if (match) {
      const handler = COMMANDS[match[1].toLowerCase()];
      if (!handler) return;
      const result = await handler(buildCtx(chat, message, match[2]));
      await reply(chat, result);
      return;
    }

    // A bare reply while /game's number-guess is in progress for this
    // person in this chat — routed to fun.js's handler without a "/" prefix.
    const pending = getPending(chat.id, message.senderId);
    if (pending?.type === "guess") {
      const result = await fun.commands.game(buildCtx(chat, message, trimmed));
      await reply(chat, result);
    }
  } catch (err) {
    console.error("helper bot reply failed:", err);
  }
}

module.exports = { dispatchHelperBot, COMMANDS };
