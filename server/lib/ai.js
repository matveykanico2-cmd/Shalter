// Shared by the in-app bot sandbox (bot.ai(), see botSandbox.js) and the
// external Bot API (POST /api/bot-api/ai, see routes/botApi.js) — one real
// LLM call implementation so a bot author gets the same behavior either way,
// using the server's own key (ANTHROPIC_API_KEY, server/config.js) rather
// than requiring every bot owner to provision and paste in their own.
const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = require("../config");

const MAX_TOKENS_CEILING = 2048;
const DEFAULT_MAX_TOKENS = 512;
const REQUEST_TIMEOUT_MS = 25_000;

// Per-bot rate limit — this calls a real, metered API using the deployment's
// own key, so a buggy or malicious bot script looping bot.ai() shouldn't be
// able to run up an unbounded bill. Same in-memory-Map-of-timestamps shape
// as express-rate-limit uses internally, just scoped to bot id instead of IP
// (see server/middleware/rateLimit.js for the HTTP-level equivalent).
const WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 12;
const callTimestampsByBotId = new Map();

function checkRateLimit(botId) {
  const now = Date.now();
  const timestamps = (callTimestampsByBotId.get(botId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_CALLS_PER_WINDOW) {
    throw new Error(`Слишком много обращений к ИИ (лимит ${MAX_CALLS_PER_WINDOW}/мин на бота) — подождите немного`);
  }
  timestamps.push(now);
  callTimestampsByBotId.set(botId, timestamps);
}

// prompt: the user-turn text. opts.system: an optional system prompt so a
// bot can have a persona/instructions without the caller re-stating them on
// every call. Returns plain text — bot code just wants a string to hand to
// bot.send()/sendMessage, not to deal with content-block shapes itself.
async function askAI(botId, prompt, opts = {}) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ИИ не настроен на этом сервере — администратору нужно задать ANTHROPIC_API_KEY");
  }
  if (!prompt || !String(prompt).trim()) {
    throw new Error("bot.ai(prompt) — prompt не может быть пустым");
  }
  checkRateLimit(botId);

  const maxTokens = Math.min(Math.max(1, Number(opts.maxTokens) || DEFAULT_MAX_TOKENS), MAX_TOKENS_CEILING);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system: opts.system ? String(opts.system).slice(0, 4000) : undefined,
        messages: [{ role: "user", content: String(prompt).slice(0, 8000) }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("ИИ не ответил вовремя");
    throw new Error(`Не удалось обратиться к ИИ: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Ошибка ИИ (${res.status}): ${body?.error?.message || "неизвестная ошибка"}`);
  }
  const text = (body.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  return text || "";
}

module.exports = { askAI };
