const { LANGUAGETOOL_URL } = require("../config");
const { isUnsupportedLanguage, UNSUPPORTED_MESSAGE } = require("./unsupportedLanguages");

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
  if (!LANGUAGETOOL_URL) return { error: "Проверка текста не настроена на сервере", status: 503 };

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
      // 429 from the public endpoint is the common one — say so rather than
      // reporting a generic failure the user can't act on.
      return upstream.status === 429
        ? { error: "Сервис проверки перегружен — попробуйте через минуту", status: 429 }
        : { error: "Сервис проверки текста сейчас недоступен", status: 502 };
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
    return {
      language: data.language?.name ?? null,
      matches: (data.matches ?? []).map((m) => ({
        offset: m.offset,
        length: m.length,
        message: m.message,
        short: m.shortMessage || m.rule?.category?.name || "",
        // Capped: some spelling rules return dozens of candidates, and a chooser
        // with 40 options is not a chooser.
        replacements: (m.replacements ?? []).slice(0, 5).map((r) => r.value),
        type: m.rule?.issueType || "other",
      })),
    };
  } catch (err) {
    const aborted = err.name === "AbortError";
    // Callers only ever show a short message, but the operator needs the real
    // reason: "не удалось связаться" covers DNS, TLS, timeouts and refused
    // connections, and they need very different fixes.
    console.error("languagetool check failed:", err.name, err.message, err.cause?.message ?? "", err.cause?.code ?? "");
    return {
      error: aborted ? "Проверка заняла слишком долго" : "Не удалось связаться с сервисом проверки",
      status: 504,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { checkText, MAX_TEXT };
