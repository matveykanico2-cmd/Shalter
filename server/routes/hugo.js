const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { LANGUAGETOOL_URL } = require("../config");
const { checkText, MAX_TEXT } = require("../lib/languageTool");

// "Hugo" — the writing checker behind the composer's check button, and the same
// engine the Hugo bot answers with (lib/hugoBot.js). The call itself lives in
// lib/languageTool.js so both share one implementation.
//
// Proxied through the server rather than called from the browser for three
// reasons: the endpoint stays swappable for a self-hosted instance via one env
// var, the checker never sees users' IP addresses, and the call sits behind this
// app's own auth and rate limiting instead of being an open relay.
//
// Privacy, stated plainly because this is a messenger: the draft text is sent to
// whatever LANGUAGETOOL_URL points at. By default that's the public
// api.languagetool.org. From the composer it only happens when someone presses
// the check button — never on typing, never automatically — and in the bot chat
// only for messages addressed to Hugo. Nothing is stored here.

const router = express.Router();
router.use(requireUserId);

router.get("/", (_req, res) => {
  res.json({
    available: !!LANGUAGETOOL_URL,
    selfHosted: !/(^|\/\/)api\.languagetool\.org/.test(LANGUAGETOOL_URL),
    maxText: MAX_TEXT,
  });
});

router.post(
  "/check",
  asyncRoute(async (req, res) => {
    const result = await checkText(String(req.body?.text ?? ""), req.body?.language || "auto");
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ matches: result.matches, language: result.language });
  })
);

module.exports = router;
