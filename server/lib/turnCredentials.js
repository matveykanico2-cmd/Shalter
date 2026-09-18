const crypto = require("crypto");

// Time-limited TURN credentials (coturn's REST API auth mechanism: username
// is an expiry timestamp, credential is HMAC-SHA1(secret, username) — see
// https://github.com/coturn/coturn/blob/master/docs/turn-rest-api.md and the
// matching `use-auth-secret`/`static-auth-secret` setup in DEPLOY.md).
//
// Static shared username/password (the old openrelay.metered.ca demo relay
// this replaces) has to be baked into the client bundle forever and can't be
// revoked without breaking every build in the wild. A secret that only the
// server holds, minted fresh per call and expired within the hour, doesn't
// have that problem — and it's the mechanism coturn was built around, not a
// bolt-on.
const TURN_SECRET = process.env.TURN_SECRET || "";
const TURN_URLS = (process.env.TURN_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TURN_TTL_SECONDS = 3600;

function isConfigured() {
  return !!TURN_SECRET && TURN_URLS.length > 0;
}

// Always includes public STUN — free, needs no server, and enough on its own
// for two peers that aren't behind symmetric NAT. TURN is added on top when
// configured, for the networks STUN can't traverse.
function getIceServers() {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (!isConfigured()) return servers;

  const username = String(Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS);
  const credential = crypto.createHmac("sha1", TURN_SECRET).update(username).digest("base64");
  servers.push({ urls: TURN_URLS, username, credential });
  return servers;
}

module.exports = { getIceServers, isConfigured };
