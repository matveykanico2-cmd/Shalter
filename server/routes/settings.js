const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getSettings, updateSettings } = require("../data/settings");

const router = express.Router();
router.use(requireUserId);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    const settings = await getSettings(req.uid);
    res.json({ settings });
  })
);

router.patch(
  "/",
  asyncRoute(async (req, res) => {
    const settings = await updateSettings(req.uid, req.body ?? {});
    res.json({ settings });
  })
);

module.exports = router;
