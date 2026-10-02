import { api } from "../api.js";

const STUN_FALLBACK = [{ urls: "stun:stun.l.google.com:19302" }];

export async function fetchIceServers() {
  try {
    const { iceServers } = await api.getIceServers();
    return Array.isArray(iceServers) && iceServers.length ? iceServers : STUN_FALLBACK;
  } catch {
    return STUN_FALLBACK;
  }
}
