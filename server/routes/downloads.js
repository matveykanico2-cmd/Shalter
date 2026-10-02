const fs = require("fs");
const path = require("path");
const express = require("express");

const DOWNLOAD_DIR = path.join(__dirname, "..", "..", "public", "downloads");
const PACKAGE_JSON = path.join(__dirname, "..", "..", "package.json");

const ARTIFACTS = [
  { id: "windows", file: "Shalter-Windows.zip" },
  { id: "android", file: "Shalter.apk" },
  { id: "linux", file: "Shalter.AppImage" },
  { id: "linux-deb", file: "Shalter.deb" },
];

const router = express.Router();

router.get("/", (_req, res) => {
  let version = "";
  try {
    version = require(PACKAGE_JSON).version ?? "";
  } catch {
  }

  const artifacts = ARTIFACTS.map(({ id, file }) => {
    try {
      const stat = fs.statSync(path.join(DOWNLOAD_DIR, file));
      if (!stat.isFile() || stat.size === 0) return { id, available: false };
      return { id, available: true, url: `/downloads/${file}`, size: stat.size, updatedAt: stat.mtime.toISOString() };
    } catch {
      return { id, available: false };
    }
  });

  res.setHeader("Cache-Control", "no-store");
  res.json({ version, artifacts });
});

module.exports = router;
