// Runs a bot owner's own JavaScript — written in the in-app editor (Settings
// → Боты → Код) — against an incoming message, instead of requiring an
// external script polling the Bot API (server/routes/botApi.js; both exist
// side by side, use whichever fits).
//
// IMPORTANT — what this sandbox is and isn't: Node's own `vm` module docs
// say plainly "the vm module is not a security mechanism. Do not use it to
// run untrusted code." This restricts the *accidental* blast radius (no
// require/process/filesystem access, an execution timeout so a stray
// infinite loop can't wedge the server) for code *you* write for *your own*
// bot — it is not a hardened boundary against someone else's adversarial
// code. Don't paste in a bot script from a stranger and expect this to
// protect you from it, any more than you'd run a stranger's shell script.
const vm = require("vm");
const botLogs = require("../data/botLogs");
const { sendBotMessage } = require("./botMessaging");

const EXECUTION_TIMEOUT_MS = 3000;

function safeStringify(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// `msg` is a plain-data snapshot of the incoming message; `bot.send`/
// `bot.sendTo` mirror the external Bot API's sendMessage exactly (same
// shared helper), so the same mental model applies to both ways of
// programming a bot.
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
    // Deliberately no require/process/global/Buffer/module — a clean,
    // curated surface rather than full Node access.
  });

  try {
    const script = new vm.Script(
      `(async () => {\n${code}\nif (typeof handleMessage === "function") return await handleMessage(msg, bot);\nthrow new Error("Определите async function handleMessage(msg, bot) { ... }");\n})()`,
      { filename: "bot.js" }
    );
    // Two layers against a runaway script: vm's own `timeout` interrupts
    // long-running *synchronous* execution (e.g. a top-level `while(true){}`)
    // by throwing inside V8 itself; the Promise.race below additionally
    // bounds the *async* case (an awaited call that never resolves), which
    // vm's timeout alone can't reach since control has already returned to
    // Node's event loop by then.
    const invocation = script.runInContext(context, { timeout: EXECUTION_TIMEOUT_MS });
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

module.exports = { runBotCode, EXECUTION_TIMEOUT_MS };
