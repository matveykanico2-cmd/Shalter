const crypto = require("crypto");

// Two ways to configure a TURN relay, because two different situations call
// for them:
//
// 1. TURN_SECRET — time-limited credentials (coturn's REST API auth: username
//    is an expiry timestamp, credential is HMAC-SHA1(secret, username), see
//    https://github.com/coturn/coturn/blob/master/docs/turn-rest-api.md and
//    the matching `use-auth-secret`/`static-auth-secret` setup in DEPLOY.md).
//    For a self-hosted coturn, where the server can hold a secret nothing
//    else ever sees.
//
// 2. TURN_USERNAME + TURN_CREDENTIAL — a fixed pair, handed straight to every
//    client as-is. For a hosted TURN provider (e.g. Metered.ca's free tier)
//    that just gives you a long-term username/password from its dashboard —
//    there's no shared secret to HMAC with, only the pair itself. Less ideal
//    (can't be time-limited or rotated without a deploy), but a five-minute
//    fix versus standing up coturn, and no worse than what it replaces.
//
// TURN_SECRET wins if both are set — prefer the revocable option.
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

// Always includes public STUN — free, needs no server, and enough on its own
// for two peers that aren't behind symmetric NAT. TURN is added on top when
// configured, for the networks STUN can't traverse.
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
