const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { LANGUAGETOOL_URL } = require("../config");
const { checkText, MAX_TEXT } = require("../lib/languageTool");

const router = express.Router();
router.use(requireUserId);

router.get("/", (_req, res) => {
  res.json({
    available: true,
    languageTool: !!LANGUAGETOOL_URL,
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
