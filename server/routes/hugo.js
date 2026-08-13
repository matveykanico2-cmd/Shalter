const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { LANGUAGETOOL_URL } = require("../config");

// "Hugo" — the writing checker behind the composer's check button. Finds typos,
// agreement and punctuation mistakes in a draft and offers replacements.
//
// Backed by LanguageTool, not an LLM: it's a real proofreading engine with
// genuinely good Russian, it returns exact offsets and concrete replacements
// (so a fix can be applied mechanically rather than by asking a model to rewrite
// the text and hoping), and it needs no API key.
//
// Proxied through the server rather than called from the browser for three
// reasons: the endpoint stays swappable for a self-hosted instance via one env
// var, the checker never sees users' IP addresses, and the call sits behind this
// app's own auth and rate limiting instead of being an open relay.
//
// Privacy, stated plainly because this is a messenger: the draft text is sent to
// whatever LANGUAGETOOL_URL points at. By default that's the public
// api.languagetool.org. It only happens when someone presses the check button —
// never on typing, never automatically — and nothing is stored here.

// LanguageTool's public API caps a request at 20k characters; this is well under
// that and far past any realistic chat message.
const MAX_TEXT = 4000;

const router = express.Router();
router.use(requireUserId);

router.get("/", (_req, res) => {
  res.json({ available: !!LANGUAGETOOL_URL, selfHosted: !/(^|\/\/)api\.languagetool\.org/.test(LANGUAGETOOL_URL) });
});

router.post(
  "/check",
  asyncRoute(async (req, res) => {
    const text = String(req.body?.text ?? "");
    if (!text.trim()) return res.json({ matches: [] });
    if (text.length > MAX_TEXT) {
      return res.status(413).json({ error: `Слишком длинный текст — максимум ${MAX_TEXT} символов` });
    }
    if (!LANGUAGETOOL_URL) return res.status(503).json({ error: "Проверка текста не настроена на сервере" });

    const body = new URLSearchParams({
      text,
      // "auto" so a Russian/English mix is handled without the user picking a
      // language; preferredVariants only matters once auto-detection lands on
      // one of these, and picking a variant avoids false positives.
      language: req.body?.language || "auto",
      preferredVariants: "en-US,de-DE,pt-BR",
    });

    // The public instance is occasionally slow; a proofreading call that hangs
    // is worse than one that fails, since the user is waiting to press send.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let data;
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
        const status = upstream.status === 429 ? 429 : 502;
        return res.status(status).json({
          error:
            upstream.status === 429
              ? "Сервис проверки перегружен — попробуйте через минуту"
              : "Сервис проверки текста сейчас недоступен",
        });
      }
      data = await upstream.json();
    } catch (err) {
      const aborted = err.name === "AbortError";
      // The client only ever sees a short message, but the operator needs the
      // real reason: "не удалось связаться" covers DNS, TLS, timeouts and
      // refused connections, and they need very different fixes.
      console.error("hugo check failed:", err.name, err.message, err.cause?.message ?? "", err.cause?.code ?? "");
      return res.status(504).json({ error: aborted ? "Проверка заняла слишком долго" : "Не удалось связаться с сервисом проверки" });
    } finally {
      clearTimeout(timeout);
    }

    // Reshaped to only what the UI needs: LanguageTool's raw response carries a
    // lot of rule metadata that would just be dead weight on the wire.
    const matches = (data.matches ?? []).map((m) => ({
      offset: m.offset,
      length: m.length,
      message: m.message,
      short: m.shortMessage || m.rule?.category?.name || "",
      // Capped: some spelling rules return dozens of candidates, and a chooser
      // with 40 options is not a chooser.
      replacements: (m.replacements ?? []).slice(0, 5).map((r) => r.value),
      type: m.rule?.issueType || "other",
    }));

    res.json({ matches, language: data.language?.name ?? null });
  })
);

module.exports = router;
