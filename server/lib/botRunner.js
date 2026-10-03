// Отдельный процесс, в котором исполняется код бота (см. botSandbox.js).
//
// Запускается с --permission: без доступа к файлам (кроме этого файла и
// проверки адресов из linkPreview.js), без дочерних процессов и воркеров и с
// пустым окружением. Даже если код бота выберется из vm-контекста (а из vm
// выбраться легко — это не граница безопасности), он окажется в этом процессе,
// а не в сервере: ни базы, ни ключей шифрования, ни секретов из env.
"use strict";
const vm = require("vm");
const { assertPublicUrl } = require("./linkPreview");

// --permission не ограничивает сеть, поэтому код, выбравшийся из vm, мог бы
// взять настоящий fetch / require("net") и пойти на localhost или в метаданные
// облака в обход assertPublicUrl. Убираем из процесса все пути к сети, модулям
// и сигналам: настоящий fetch остаётся только в замыкании guardedFetch.
// "use strict" выше — чтобы через стек вызовов (CallSite.getFunction) нельзя
// было достать функции этого модуля.
const rawFetch = globalThis.fetch;
for (const name of ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"]) delete globalThis[name];
const denied = () => {
  throw new Error("Недоступно в коде бота");
};
for (const name of ["binding", "_linkedBinding", "dlopen", "getBuiltinModule", "kill"]) {
  try {
    Object.defineProperty(process, name, { value: denied, writable: false, configurable: false });
  } catch {
  }
}
try {
  Object.defineProperty(process, "mainModule", { value: undefined, writable: false, configurable: false });
} catch {
}

function safeStringify(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

let nextCallId = 1;
const pendingSends = new Map();

function callParent(payload) {
  const id = nextCallId++;
  return new Promise((resolve, reject) => {
    pendingSends.set(id, { resolve, reject });
    process.send({ ...payload, type: "send", id });
  });
}

// Сеть остаётся, но только во внешний интернет — не во внутренние сервисы.
async function guardedFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url;
  await assertPublicUrl(String(url));
  return rawFetch(input, { ...init, redirect: "error" });
}

async function run({ code, msg }) {
  const log = (level) => (...args) => process.send({ type: "log", level, text: args.map(safeStringify).join(" ") });
  const context = vm.createContext({
    console: { log: log("log"), error: log("error"), warn: log("warn") },
    fetch: guardedFetch,
    setTimeout,
    clearTimeout,
    msg: { ...msg },
    bot: {
      send: (text, opts) => callParent({ chatId: msg.chatId, text, opts }),
      sendTo: (chatId, text, opts) => callParent({ chatId, text, opts }),
    },
  });
  const script = new vm.Script(
    `(async () => {\n${code}\nif (typeof handleMessage === "function") return await handleMessage(msg, bot);\nthrow new Error("Определите async function handleMessage(msg, bot) { ... }");\n})()`,
    { filename: "bot.js" }
  );
  return script.runInContext(context, { timeout: 300 });
}

process.on("message", async (m) => {
  if (m?.type === "sendResult") {
    const pending = pendingSends.get(m.id);
    pendingSends.delete(m.id);
    if (!pending) return;
    if (m.error) pending.reject(new Error(m.error));
    else pending.resolve(m.message);
    return;
  }
  if (m?.type !== "run") return;
  try {
    const result = await run(m);
    try {
      process.send({ type: "done", result });
    } catch {
      process.send({ type: "done", result: safeStringify(result) });
    }
  } catch (err) {
    process.send({ type: "done", error: err?.message || String(err) });
  }
});
