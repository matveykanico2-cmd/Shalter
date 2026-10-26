// Разблокировка по Face ID / отпечатку для код-пароля, как public/js/lib/biometricLock.js:
// ключ WebAuthn только этого устройства, в localStorage — его id. Предлагается лишь в приложении.
import { b64urlToBuf, bufToB64url } from "./passkey";

const CRED_KEY = "shalter_biometric_cred_id";

const stored = () => {
  try {
    return localStorage.getItem(CRED_KEY);
  } catch {
    return null;
  }
};

export const isBiometricSupported = () => typeof window.PublicKeyCredential !== "undefined" && !!navigator.credentials?.create;

export async function isBiometricAvailable() {
  if (!isBiometricSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export const hasBiometric = () => !!stored();

export async function enableBiometric(userName = "Shalter") {
  if (!isBiometricSupported()) throw new Error("Устройство не поддерживает биометрию");
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Shalter", id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: userName, displayName: userName },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Не удалось включить биометрию");
  localStorage.setItem(CRED_KEY, bufToB64url(cred.rawId));
}

export async function unlockBiometric() {
  const id = stored();
  if (!id) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: b64urlToBuf(id) }],
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
  try {
    localStorage.removeItem(CRED_KEY);
  } catch {
    // Хранилище недоступно — и ключа там нет.
  }
}
