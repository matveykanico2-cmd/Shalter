const vm = require("vm");
const botLogs = require("../data/botLogs");
const { sendBotMessage } = require("./botMessaging");

const EXECUTION_TIMEOUT_MS = 20_000;

const SYNC_TIMEOUT_MS = 300;

function safeStringify(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function runBotCode(bot, code, msg) {
  const logs = [];
  function record(level, args) {
    const text = args.map(safeStringify).join(" ");
    logs.push({ level, text });
    botLogs.append(bot.id, level, text);
  }

  const sandboxConsole = {
    log: (...a) => record("log", a),
    error: (...a) => record("error", a),
    warn: (...a) => record("warn", a),
  };

  const context = vm.createContext({
    console: sandboxConsole,
    fetch: (...args) => fetch(...args),
    setTimeout,
    clearTimeout,
    msg: { ...msg },
    bot: {
      send: (text, opts) => sendBotMessage(bot.userId, msg.chatId, text, opts),
      sendTo: (chatId, text, opts) => sendBotMessage(bot.userId, chatId, text, opts),
    },
  });

  try {
    const script = new vm.Script(
      `(async () => {\n${code}\nif (typeof handleMessage === "function") return await handleMessage(msg, bot);\nthrow new Error("Определите async function handleMessage(msg, bot) { ... }");\n})()`,
      { filename: "bot.js" }
    );
    const invocation = script.runInContext(context, { timeout: SYNC_TIMEOUT_MS });
    const result = await Promise.race([
      invocation,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Превышено время выполнения (${EXECUTION_TIMEOUT_MS}мс)`)), EXECUTION_TIMEOUT_MS)
      ),
    ]);
    return { logs, result };
  } catch (err) {
    const message = err?.message || String(err);
    record("error", [message]);
    return { logs, error: message };
  }
}

module.exports = { runBotCode, EXECUTION_TIMEOUT_MS, SYNC_TIMEOUT_MS };
