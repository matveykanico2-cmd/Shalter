// Локальная разблокировка по биометрии (Face ID / отпечаток / Windows Hello) —
// Настройки → Конфиденциальность. Как и код-пароль (см. lib/passcodeLock.js),
// это местный замок поверх уже выполненного входа, а не второй фактор: сессия
// в куке остаётся действительной. Отличие от код-пароля лишь в способе снять
// замок — вместо ввода PIN платформенный аутентификатор проверяет владельца
// биометрией.
//
// Работает целиком на устройстве через WebAuthn с платформенным
// аутентификатором. При включении заводится ключ (credential), его id
// сохраняется в localStorage. Разблокировка — navigator.credentials.get() с
// userVerification: "required": если аутентификатор не подтвердил владельца
// биометрией или PIN устройства, промис отклоняется, и замок не снимается.
// Подпись проверять некому и незачем — секрета на стороне сервера нет, ровно
// как у локального код-пароля хранится только хэш.
const CRED_KEY = "shalter_biometric_cred_id";

function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const str = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

export function isBiometricSupported() {
  return typeof window.PublicKeyCredential !== "undefined" && !!navigator.credentials?.create;
}

// Есть ли на устройстве встроенный аутентификатор (сканер лица/пальца, Hello).
// Асинхронно — браузер отвечает не мгновенно; результат кэшируется вызывающим.
export async function isBiometricAvailable() {
  if (!isBiometricSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function hasBiometric() {
  return !!localStorage.getItem(CRED_KEY);
}

// Заводит ключ и включает замок. Вызов только по нажатию — браузер требует
// пользовательского жеста. Бросает исключение, если человек отменил проверку.
export async function enableBiometric(userName = "Shalter") {
  if (!isBiometricSupported()) throw new Error("Устройство не поддерживает биометрию");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Shalter", id: location.hostname },
      user: { id: userId, name: userName, displayName: userName },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  });
  if (!cred) throw new Error("Не удалось включить биометрию");
  localStorage.setItem(CRED_KEY, bufToB64url(cred.rawId));
}

// Снимает замок. true — аутентификатор подтвердил владельца; false — отказ или
// отмена (вызывающий тогда оставляет замок и предлагает код-пароль).
export async function unlockBiometric() {
  const stored = localStorage.getItem(CRED_KEY);
  if (!stored) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: b64urlToBuf(stored) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function removeBiometric() {
  localStorage.removeItem(CRED_KEY);
}
