const {
  HUGO_AI_ENABLED,
  HUGO_AI_URL,
  HUGO_AI_MODEL,
  HUGO_AI_GET_URL,
  HUGO_AI_TIMEOUT_MS,
  OLLAMA_URL,
  OLLAMA_MODEL,
} = require("../config");

const MAX_REPLY = 3500;
const MAX_TURN = 1500;
const MAX_GET_PROMPT = 3000;

const FEATURES = [
  "личные чаты, группы (с уровнями и правами участников), каналы с постами, комментариями и статистикой",
  "аудио- и видеозвонки, в том числе групповые; прямые эфиры",
  "истории (сторис) с редактором, статусы профиля",
  "папки чатов, архив, закреп, отложенные сообщения, напоминания, треды (ответы в ветке)",
  "реакции, опросы, стикеры и наборы стикеров, свои анимированные эмодзи, рисование, мемы, голосовые и кружки",
  "перевод сообщений, поиск по чатам, календарь чата",
  "звёзды (внутренняя валюта), подарки с ограниченным тиражом, Shalter Premium и Business",
  "свои боты (Настройки → Боты, встроенный редактор кода или Bot API с токеном), мини-приложения",
  "маркет и объявления, люди рядом, аукцион юзернеймов",
  "обои чатов, код-пароль, двухфакторная аутентификация, вход по QR, список активных сеансов, выгрузка своих данных",
  "веб-версия, приложения для Windows, Linux и Android (страница /download)",
];

function systemPrompt(knowledge) {
  return (
    "Ты — Hugo, встроенный помощник и поддержка мессенджера Shalter. " +
    "Отвечай на языке последнего сообщения пользователя (по умолчанию — по-русски). " +
    "Будь дружелюбным и кратким: обычно 1–5 предложений, списки — только когда они правда нужны. " +
    "Можно **жирный** и *курсив*, но без заголовков, таблиц и HTML.\n\n" +
    "Что умеет Shalter:\n- " +
    FEATURES.join("\n- ") +
    "\n\nПроверенные ответы на частые вопросы (опирайся на них дословно по смыслу):\n" +
    knowledge +
    "\n\nПравила:\n" +
    "- Не выдумывай пункты меню, цены, сроки и возможности, которых здесь нет. Не знаешь — так и скажи и предложи описать проблему: сообщение прочитает человек из поддержки.\n" +
    "- Страницы приложения называй относительными путями (/download, /bots) — не придумывай доменов и внешних ссылок.\n" +
    "- Никогда не проси пароли, коды входа, коды 2FA или резервные коды.\n" +
    "- Оплата в Shalter — только переводом администрации, платёжного сервиса в приложении нет; ничего не обещай от имени администрации. Premium за звёзды не продаётся. Реферальной программы, приглашений друзей за бонусы и промокодов нет.\n" +
    "- Проверку орфографии делает отдельная команда: сообщение, начинающееся со слова «проверь». Если просят проверить текст — подскажи её.\n" +
    "- На общие вопросы, не связанные с Shalter, тоже можно отвечать — коротко и по делу."
  );
}

function cleanReply(raw) {
  let text = String(raw ?? "");
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "");
  text = text.replace(/\n+-{3,}\s*\n[\s\S]*pollinations[\s\S]*$/i, "");
  text = text
    .split("\n")
    .filter((line) => !(/pollinations/i.test(line) && /(sponsor|support|powered|\bads?\b|реклам)/i.test(line)))
    .join("\n");
  text = text.replace(/^#{1,6}\s+/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > MAX_REPLY) {
    const cut = text.slice(0, MAX_REPLY);
    const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
    text = (lastBreak > MAX_REPLY * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trimEnd() + "…";
  }
  return text || null;
}

function clip(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });
}

async function fetchRetry429(url, init) {
  for (;;) {
    const res = await fetch(url, init);
    if (res.status !== 429 || init.signal?.aborted) return res;
    await sleep(3000, init.signal);
    if (init.signal?.aborted) return res;
  }
}

let remoteTail = Promise.resolve();
function inRemoteQueue(signal, fn) {
  const run = remoteTail.then(() => {
    if (signal.aborted) throw new Error("timed out in queue");
    return fn();
  });
  remoteTail = run.catch(() => {});
  const aborted = new Promise((_, reject) =>
    signal.addEventListener("abort", () => reject(new Error("timed out in queue")), { once: true })
  );
  return Promise.race([run, aborted]);
}

async function postJson(url, body, signal) {
  const res = await fetchRetry429(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function viaOllama(messages, signal) {
  const data = await postJson(
    `${OLLAMA_URL}/api/chat`,
    { model: OLLAMA_MODEL, messages, stream: false, options: { temperature: 0.6 } },
    signal
  );
  return data?.message?.content;
}

async function viaOpenAiCompatible(messages, signal) {
  const data = await postJson(
    HUGO_AI_URL,
    { model: HUGO_AI_MODEL, messages, temperature: 0.6, private: true, referrer: "shalter" },
    signal
  );
  return data?.choices?.[0]?.message?.content;
}

async function viaGet(messages, signal) {
  const [system, ...turns] = messages;
  let dialog = turns.map((m) => `${m.role === "assistant" ? "Hugo" : "Пользователь"}: ${m.content}`).join("\n");
  if (dialog.length > MAX_GET_PROMPT) dialog = dialog.slice(-MAX_GET_PROMPT);
  const prompt = `${dialog}\nHugo:`;
  const url =
    HUGO_AI_GET_URL.replace(/\/?$/, "/") +
    encodeURIComponent(prompt) +
    `?model=${encodeURIComponent(HUGO_AI_MODEL)}&private=true&referrer=shalter&system=${encodeURIComponent(clip(system.content, 2500))}`;
  const res = await fetchRetry429(url, { signal });
  if (!res.ok) throw new Error(`GET ${HUGO_AI_GET_URL} → HTTP ${res.status}`);
  return res.text();
}

function providers() {
  const list = [];
  if (OLLAMA_URL) list.push(["ollama", viaOllama, false]);
  if (HUGO_AI_URL) list.push(["openai-compatible", viaOpenAiCompatible, true]);
  if (HUGO_AI_GET_URL) list.push(["get", viaGet, true]);
  return list;
}

function isAiAvailable() {
  return HUGO_AI_ENABLED && providers().length > 0;
}

async function generateReply(history, { knowledge = "", timeoutMs = HUGO_AI_TIMEOUT_MS } = {}) {
  if (!isAiAvailable() || !history?.length) return null;
  const messages = [
    { role: "system", content: systemPrompt(knowledge) },
    ...history.map((m) => ({ role: m.role, content: clip(m.content, MAX_TURN) })),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const list = providers();
  try {
    for (const [i, [name, call, remote]] of list.entries()) {
      if (controller.signal.aborted) break;
      const step = () => {
        const left = deadline - Date.now();
        const stepMs = i === list.length - 1 ? left : Math.max(3000, Math.round(left * 0.75));
        return call(messages, AbortSignal.any([controller.signal, AbortSignal.timeout(stepMs)]));
      };
      try {
        const raw = remote ? await inRemoteQueue(controller.signal, step) : await step();
        const text = cleanReply(raw);
        if (text) return { text, provider: name };
      } catch (err) {
        if (!controller.signal.aborted) console.warn(`hugo ai: ${name} failed:`, err.message);
      }
    }
    if (controller.signal.aborted) console.warn(`hugo ai: no reply within ${timeoutMs} ms`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { generateReply, isAiAvailable, cleanReply };
