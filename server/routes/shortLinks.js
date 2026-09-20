// GET /s/:code — public redirect for links made with /short. Not under /api:
// it's meant to be opened directly in a browser, like the target URL itself.
const express = require("express");
const { getShortLink, registerClick } = require("../data/shortLinks");

const router = express.Router();

router.get("/:code", (req, res) => {
  const link = getShortLink(req.params.code);
  if (!link) return res.status(404).send("Ссылка не найдена");
  registerClick(link.code);
  res.redirect(302, link.targetUrl);
});

module.exports = router;
