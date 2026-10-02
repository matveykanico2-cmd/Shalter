const HASH_KEY = "shalter_passcode_hash";
const SALT_KEY = "shalter_passcode_salt";

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashCode(code, salt) {
  const data = new TextEncoder().encode(`${salt}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(digest);
}

export function hasPasscode() {
  return !!localStorage.getItem(HASH_KEY);
}

export async function setPasscode(code) {
  const salt = crypto.randomUUID();
  const hash = await hashCode(code, salt);
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(HASH_KEY, hash);
}

export async function verifyPasscode(code) {
  const salt = localStorage.getItem(SALT_KEY);
  const stored = localStorage.getItem(HASH_KEY);
  if (!salt || !stored) return false;
  return (await hashCode(code, salt)) === stored;
}

export function removePasscode() {
  localStorage.removeItem(HASH_KEY);
  localStorage.removeItem(SALT_KEY);
}
