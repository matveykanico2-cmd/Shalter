const path = require("path");
const { spawn } = require("child_process");
const botLogs = require("../data/botLogs");
const { sendBotMessage } = require("./botMessaging");

const EXECUTION_TIMEOUT_MS = 20_000;

const SYNC_TIMEOUT_MS = 300;

// Код бота раньше крутился через vm прямо в процессе сервера, а vm — не
// песочница: `console.log.constructor("return process")()` отдавал боту весь
// сервер (env с секретами, базу, child_process). Теперь каждый запуск — в
// отдельном процессе botRunner.js под --permission, с пустым окружением.
const RUNNER = path.join(__dirname, "botRunner.js");
const LINK_PREVIEW = path.join(__dirname, "linkPreview.js");
const MAX_PARALLEL = 4;
const MAX_QUEUE = 50;

let running = 0;
const queue = [];

function withSlot(task) {
  return new Promise((resolve, reject) => {
    const start = () => {
      running += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          queue.shift()?.();
        });
    };
    if (running < MAX_PARALLEL) start();
    else if (queue.length < MAX_QUEUE) queue.push(start);
    else reject(new Error("Слишком много запусков ботов одновременно, попробуйте позже"));
  });
}

function spawnRunner(bot, code, msg, record) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--permission", `--allow-fs-read=${RUNNER}`, `--allow-fs-read=${LINK_PREVIEW}`, "--max-old-space-size=64", RUNNER],
      { env: {}, stdio: ["ignore", "ignore", "ignore", "ipc"] }
    );
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ error: `Превышено время выполнения (${EXECUTION_TIMEOUT_MS}мс)` }), EXECUTION_TIMEOUT_MS);

    child.on("message", async (m) => {
      if (m?.type === "log") record(m.level === "error" || m.level === "warn" ? m.level : "log", String(m.text ?? "").slice(0, 4000));
      else if (m?.type === "send") {
        try {
          const message = await sendBotMessage(bot.userId, m.chatId, m.text, m.opts ?? {});
          if (child.connected) child.send({ type: "sendResult", id: m.id, message });
        } catch (err) {
          if (child.connected) child.send({ type: "sendResult", id: m.id, error: err.message });
        }
      } else if (m?.type === "done") finish(m.error ? { error: m.error } : { result: m.result });
    });
    child.on("error", (err) => finish({ error: `Не удалось запустить код бота: ${err.message}` }));
    child.on("exit", () => finish({ error: "Процесс бота завершился без ответа" }));
    child.send({ type: "run", code, msg });
  });
}

async function runBotCode(bot, code, msg) {
  const logs = [];
  function record(level, text) {
    logs.push({ level, text });
    botLogs.append(bot.id, level, text);
  }

  try {
    const outcome = await withSlot(() => spawnRunner(bot, code, { ...msg }, record));
    if (outcome.error) {
      record("error", outcome.error);
      return { logs, error: outcome.error };
    }
    return { logs, result: outcome.result };
  } catch (err) {
    const message = err?.message || String(err);
    record("error", message);
    return { logs, error: message };
  }
}

module.exports = { runBotCode, EXECUTION_TIMEOUT_MS, SYNC_TIMEOUT_MS };
