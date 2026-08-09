import { api } from "../api.js";

// Real end-to-end encryption for secret chats (chat.type === "secret") —
// ECDH (P-256) key agreement + AES-256-GCM, entirely via the browser's
// native Web Crypto API (no external crypto library, matching this
// project's no-bundler-dependency constraint — see AGENTS.md).
//
// How it works: each device generates its own ECDH keypair once, stores
// the private key only in this browser's IndexedDB, and uploads only the
// public half (server/routes/users.js's /:id/e2e-key — the server can only
// ever see one half of any pair, so it can never derive the shared secret
// itself). When two accounts open a secret chat, each side locally derives
// the *same* AES key from "my private key + their public key" (that's what
// ECDH guarantees) and uses it to encrypt/decrypt — ciphertext is all the
// server ever stores or relays for these messages.
//
// Deliberate v1 limitations (be upfront about these, not just to yourself):
// - No forward secrecy / ratcheting (unlike Signal) — one static shared key
//   per chat pair, reused for every message. Good enough to keep the
//   server from reading anything, not a claim of Signal-grade security.
// - No safety-number / key-verification UI — a public key is trusted the
//   moment the server hands it back, so a *malicious server* could swap in
//   its own key and MITM (a properly paranoid client would let users
//   compare key fingerprints out-of-band). Protects against "server
//   operator/DB breach reads your messages," not against "server operator
//   actively attacks a specific conversation."
// - Attachments in secret chats are NOT encrypted in this version — only
//   the text body. Treat media in a "secret" chat as no more private than
//   in a regular chat until that's addressed.
// - The private key is generated as extractable:true (a browser-crypto-API
//   quirk: an ECDH keyPair's public half can't be marked extractable
//   without the private half being too) — it is simply never exported or
//   transmitted by this code, but that's an implementation discipline, not
//   a hard guarantee against a malicious/compromised page (XSS).

const DB_NAME = "shalter-e2e";
const STORE = "keys";
const PRIVATE_KEY_ID = "keypair";
const ECDH_PARAMS = { name: "ECDH", namedCurve: "P-256" };
// Prefixes an encrypted payload so decryptText() can tell ciphertext apart
// from plaintext (e.g. a message sent before this device had derived a key,
// or from a client that doesn't support secret chats) instead of garbling it.
const CIPHER_PREFIX = "e2e1:";

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let keyPairPromise = null;
function getOrCreateKeypair() {
  if (!keyPairPromise) {
    keyPairPromise = (async () => {
      const existing = await idbGet(PRIVATE_KEY_ID);
      if (existing) return existing;
      const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey"]);
      await idbSet(PRIVATE_KEY_ID, keyPair);
      return keyPair;
    })();
  }
  return keyPairPromise;
}

let uploadedFor = null;
// Safe to call as often as you like (e.g. every time a secret chat opens) —
// generation/upload only actually happens once per device/session.
export async function ensureKeypair(myUserId) {
  const keyPair = await getOrCreateKeypair();
  if (uploadedFor !== myUserId) {
    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    await api.uploadE2eKey(myUserId, JSON.stringify(jwk));
    uploadedFor = myUserId;
  }
  return keyPair;
}

const sharedKeyCache = new Map(); // otherUserId -> Promise<CryptoKey>

// Derives (and caches, for this page session) the AES-GCM key this device
// shares with `otherUserId` — same result on their end, derived from their
// own private key + this device's public key, without either side ever
// transmitting anything but public keys.
export async function getSharedKey(myUserId, otherUserId, otherPublicKeyJwk) {
  if (sharedKeyCache.has(otherUserId)) return sharedKeyCache.get(otherUserId);
  const promise = (async () => {
    const { privateKey } = await ensureKeypair(myUserId);
    const otherPublicKey = await crypto.subtle.importKey("jwk", JSON.parse(otherPublicKeyJwk), ECDH_PARAMS, true, []);
    return crypto.subtle.deriveKey(
      { name: "ECDH", public: otherPublicKey },
      privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  })();
  sharedKeyCache.set(otherUserId, promise);
  return promise;
}

function toB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export async function encryptText(sharedKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, new TextEncoder().encode(plaintext));
  return `${CIPHER_PREFIX}${toB64(iv)}:${toB64(new Uint8Array(ciphertext))}`;
}

export function isEncrypted(text) {
  return typeof text === "string" && text.startsWith(CIPHER_PREFIX);
}

// Never throws — a message that fails to decrypt (wrong/missing key, a key
// derived after chat history existed, corruption) renders as a clear
// placeholder instead of crashing the whole message list.
export async function decryptText(sharedKey, packed) {
  if (!isEncrypted(packed)) return packed;
  try {
    const [ivB64, ctB64] = packed.slice(CIPHER_PREFIX.length).split(":");
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, sharedKey, fromB64(ctB64));
    return new TextDecoder().decode(plainBuf);
  } catch {
    return "🔒 Не удалось расшифровать сообщение";
  }
}
