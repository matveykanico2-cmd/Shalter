import { api } from "../api.js";

// STUN alone is enough to traverse most home/office NATs, but not symmetric
// NAT (common on mobile carriers and some routers) — that needs a TURN
// relay. The real relay comes from the server (server/lib/turnCredentials.js,
// backed by your own coturn — see DEPLOY.md); this is only the fallback for
// when TURN_SECRET/TURN_URLS aren't configured, or the request fails.
const STUN_FALLBACK = [{ urls: "stun:stun.l.google.com:19302" }];

// Not cached across calls: TURN credentials from the server are time-limited
// (server/lib/turnCredentials.js), so a call started long after the last
// fetch needs a fresh set rather than an expired one.
export async function fetchIceServers() {
  try {
    const { iceServers } = await api.getIceServers();
    return Array.isArray(iceServers) && iceServers.length ? iceServers : STUN_FALLBACK;
  } catch {
    return STUN_FALLBACK;
  }
}
