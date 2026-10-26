// Код-пароль этого устройства, как public/js/lib/passcodeLock.js: в localStorage только соль
// и SHA-256 от «соль:код» — те же ключи, чтобы код, заданный в старом клиенте, работал и здесь.
const HASH_KEY = "shalter_passcode_hash";
const SALT_KEY = "shalter_passcode_salt";

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hashCode(code: string, salt: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${code}`)));
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const hasPasscode = () => !!read(HASH_KEY);

export async function setPasscode(code: string) {
  const salt = crypto.randomUUID();
  const hash = await hashCode(code, salt);
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(HASH_KEY, hash);
}

export async function verifyPasscode(code: string) {
  const salt = read(SALT_KEY);
  const stored = read(HASH_KEY);
  if (!salt || !stored) return false;
  return (await hashCode(code, salt)) === stored;
}

export function removePasscode() {
  try {
    localStorage.removeItem(HASH_KEY);
    localStorage.removeItem(SALT_KEY);
  } catch {
    // Хранилище недоступно — и кода там нет.
  }
}
