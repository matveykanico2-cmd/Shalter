const crypto = require("crypto");

const TURN_SECRET = process.env.TURN_SECRET || "";
const TURN_USERNAME = process.env.TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || "";
const TURN_URLS = (process.env.TURN_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TURN_TTL_SECONDS = 3600;

function isConfigured() {
  return TURN_URLS.length > 0 && (!!TURN_SECRET || (!!TURN_USERNAME && !!TURN_CREDENTIAL));
}

function getIceServers() {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (!isConfigured()) return servers;

  if (TURN_SECRET) {
    const username = String(Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS);
    const credential = crypto.createHmac("sha1", TURN_SECRET).update(username).digest("base64");
    servers.push({ urls: TURN_URLS, username, credential });
  } else {
    servers.push({ urls: TURN_URLS, username: TURN_USERNAME, credential: TURN_CREDENTIAL });
  }
  return servers;
}

module.exports = { getIceServers, isConfigured };
