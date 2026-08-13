const fs = require("fs");
const path = require("path");
const express = require("express");

// Powers the download page (public/download.html). Public on purpose — it's
// the one page someone visits *before* they have an account.
//
// Sizes and dates are read off disk rather than written into the HTML by hand,
// because these artifacts get replaced (a new AppImage is 124MB today and
// something else next release) and a hardcoded "≈119 МБ" quietly becomes a lie.
// The same read is what decides whether a platform is offered at all: a card
// linking to a file that isn't there would 404 on click, so a missing artifact
// is shown as "скоро" instead.

// Resolved from this file, not from process.cwd() — the same way index.js
// resolves PUBLIC_DIR. cwd only happens to be the project root when the server
// is started from there; express.static was serving these files fine off
// __dirname while this route reported every one of them as missing.
const DOWNLOAD_DIR = path.join(__dirname, "..", "..", "public", "downloads");
const PACKAGE_JSON = path.join(__dirname, "..", "..", "package.json");

// The order here is the order the page renders them in (before the visitor's
// own OS gets pulled to the front).
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
    /* version is decoration; a missing package.json shouldn't 500 the page */
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

  // No caching: the whole point is that this reflects what's on disk right now,
  // including right after someone uploads a new build.
  res.setHeader("Cache-Control", "no-store");
  res.json({ version, artifacts });
});

module.exports = router;
