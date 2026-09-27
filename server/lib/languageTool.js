const { LANGUAGETOOL_URL } = require("../config");
const { isUnsupportedLanguage, UNSUPPORTED_MESSAGE } = require("./unsupportedLanguages");
const { localProofread } = require("./localProofread");

// Локальные находки, не пересекающиеся с тем, что уже нашёл LanguageTool, —
// чтобы не дублировать одно и то же место двумя подсказками.
function mergeLocal(ltMatches, local) {
  const extra = local.filter((l) => !ltMatches.some((m) => l.offset < m.offset + m.length && l.offset + l.length > m.offset));
  return [...ltMatches, ...extra].sort((a, b) => a.offset - b.offset);
}

// The proofreading call itself, shared by the two things that need it: the
// composer's check button (routes/hugo.js) and the Hugo bot, which answers a
// message you send it with the mistakes it found (lib/hugoBot.js).
//
// Backed by LanguageTool, not an LLM — a real proofreading engine with good
// Russian that returns exact offsets and concrete replacements, so a fix can be
// applied mechanically instead of asking a model to rewrite the text and hoping.
//
// Errors are returned, not thrown: every caller has to tell the user something
// specific ("перегружен" and "не настроен" need different answers), and the bot
// in particular must never crash a message send.

// LanguageTool's public API caps a request at 20k characters; this is well under
// that and far past any realistic chat message.
const MAX_TEXT = 4000;
const TIMEOUT_MS = 12000;

// Кириллица без украинских букв — это русский, и говорить об этом
// LanguageTool надо прямо. На "auto" он регулярно принимал русскую фразу за
// украинскую (языки близкие, а фраза в чате короткая) и присылал разбор
// украинскими правилами, украинским же текстом, — из-за чего Hugo отвечал на
// украинском на русское сообщение. Автоопределение остаётся там, где оно
// действительно нужно: на латинице.
const CYRILLIC = /[\u0400-\u04FF]/;

function resolveLanguage(text, requested) {
  if (requested && requested !== "auto" && !isUnsupportedLanguage(requested)) return requested;
  return CYRILLIC.test(text) ? "ru" : "auto";
}

async function checkText(text, language = "auto") {
  if (!String(text ?? "").trim()) return { matches: [] };
  if (text.length > MAX_TEXT) {
    return { error: `Слишком длинный текст — максимум ${MAX_TEXT} символов`, status: 413 };
  }
  // Встроенная проверка работает всегда, даже без внешнего сервиса: раньше без
  // LANGUAGETOOL_URL проверка просто отвечала «не настроена».
  if (!LANGUAGETOOL_URL) return { matches: localProofread(text), language: "Встроенная проверка" };

  const body = new URLSearchParams({
    // Автоопределение — только для латиницы (см. resolveLanguage выше);
    // preferredVariants срабатывает, когда оно попадает на один из этих языков,
    // и выбранный вариант убирает ложные срабатывания.
    text,
    language: resolveLanguage(text, language),
    preferredVariants: "en-US,de-DE,pt-BR",
  });

  // The public instance is occasionally slow; a proofreading call that hangs is
  // worse than one that fails, since the user is waiting to press send.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(LANGUAGETOOL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body,
      signal: controller.signal,
    });
    if (!upstream.ok) {
      // Внешний сервис перегружен/недоступен — не отказываем совсем, а отдаём
      // встроенную проверку: лучше базовая, чем никакой.
      return { matches: localProofread(text), language: "Встроенная проверка" };
    }
    const data = await upstream.json();
    // Последняя проверка: если автоопределение всё же вышло на язык, которого в
    // мессенджере нет, разбор возвращать нельзя — он придёт целиком на этом
    // языке. Лучше честно сказать, что проверить не вышло, чем ответить на нём.
    if (isUnsupportedLanguage(data.language?.code || data.language?.detectedLanguage?.code)) {
      return { error: `${UNSUPPORTED_MESSAGE} — проверить этот текст не получится`, status: 422 };
    }
    // Reshaped to only what the callers need: the raw response carries a lot of
    // rule metadata that would just be dead weight on the wire.
    const ltMatches = (data.matches ?? []).map((m) => ({
      offset: m.offset,
      length: m.length,
      message: m.message,
      short: m.shortMessage || m.rule?.category?.name || "",
      // Capped: some spelling rules return dozens of candidates, and a chooser
      // with 40 options is not a chooser.
      replacements: (m.replacements ?? []).slice(0, 5).map((r) => r.value),
      type: m.rule?.issueType || "other",
    }));
    return {
      language: data.language?.name ?? null,
      // Дополняем находками встроенной проверки (двойные пробелы, повтор слова и
      // т.п.), которых у LanguageTool может не быть.
      matches: mergeLocal(ltMatches, localProofread(text)),
    };
  } catch (err) {
    const aborted = err.name === "AbortError";
    // Callers only ever show a short message, but the operator needs the real
    // reason: "не удалось связаться" covers DNS, TLS, timeouts and refused
    // connections, and they need very different fixes.
    console.error("languagetool check failed:", err.name, err.message, err.cause?.message ?? "", err.cause?.code ?? "");
    // Сеть/таймаут — тоже не отказываем: отдаём встроенную проверку.
    void aborted;
    return { matches: localProofread(text), language: "Встроенная проверка" };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { checkText, MAX_TEXT };
