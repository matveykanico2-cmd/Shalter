const { LANGUAGETOOL_URL } = require("../config");
const { isUnsupportedLanguage, UNSUPPORTED_MESSAGE } = require("./unsupportedLanguages");
const { localProofread } = require("./localProofread");

function mergeLocal(ltMatches, local) {
  const extra = local.filter((l) => !ltMatches.some((m) => l.offset < m.offset + m.length && l.offset + l.length > m.offset));
  return [...ltMatches, ...extra].sort((a, b) => a.offset - b.offset);
}

const MAX_TEXT = 4000;
const TIMEOUT_MS = 12000;

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
  if (!LANGUAGETOOL_URL) return { matches: localProofread(text), language: "Встроенная проверка" };

  const lang = resolveLanguage(text, language);
  const body = new URLSearchParams({ text, language: lang });
  if (lang === "auto") body.set("preferredVariants", "en-US,de-DE,pt-BR");

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
      console.error("languagetool check failed: HTTP", upstream.status, (await upstream.text().catch(() => "")).slice(0, 200));
      return { matches: localProofread(text), language: "Встроенная проверка" };
    }
    const data = await upstream.json();
    if (isUnsupportedLanguage(data.language?.code || data.language?.detectedLanguage?.code)) {
      return { error: `${UNSUPPORTED_MESSAGE} — проверить этот текст не получится`, status: 422 };
    }
    const ltMatches = (data.matches ?? []).map((m) => ({
      offset: m.offset,
      length: m.length,
      message: m.message,
      short: m.shortMessage || m.rule?.category?.name || "",
      replacements: (m.replacements ?? []).slice(0, 5).map((r) => r.value),
      type: m.rule?.issueType || "other",
    }));
    return {
      language: data.language?.name ?? null,
      matches: mergeLocal(ltMatches, localProofread(text)),
    };
  } catch (err) {
    const aborted = err.name === "AbortError";
    console.error("languagetool check failed:", err.name, err.message, err.cause?.message ?? "", err.cause?.code ?? "");
    void aborted;
    return { matches: localProofread(text), language: "Встроенная проверка" };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { checkText, MAX_TEXT };
