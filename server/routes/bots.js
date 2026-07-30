const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { listBots } = require("../data/bots");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (_req, res) => {
    const bots = await listBots();
    res.json({ bots });
  })
);

module.exports = router;
