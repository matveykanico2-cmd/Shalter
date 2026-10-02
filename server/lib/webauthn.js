// Минимальная серверная часть WebAuthn (ключи доступа, passkeys) без внешних
// библиотек: разбор CBOR, authenticatorData и проверка подписи через crypto.
// Аттестацию не проверяем (просим attestation: "none") — как и большинство
// сайтов: нам важно, что вход подписан ключом, сохранённым при регистрации.
const crypto = require("crypto");

const CHALLENGE_TTL_MS = 5 * 60_000;
const challenges = new Map(); // challenge -> { userId|null, kind, expiresAt }

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function fromB64url(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(str)) throw new Error("bad base64url");
  return Buffer.from(str, "base64url");
}

function newChallenge(kind, userId = null) {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expiresAt < now) challenges.delete(k);
  if (challenges.size > 10_000) challenges.clear();
  const challenge = b64url(crypto.randomBytes(32));
  challenges.set(challenge, { kind, userId, expiresAt: now + CHALLENGE_TTL_MS });
  return challenge;
}

// Одноразово: повторно тот же challenge не примется.
function takeChallenge(challenge, kind, userId = null) {
  const entry = challenges.get(challenge);
  challenges.delete(challenge);
  if (!entry || entry.kind !== kind || entry.expiresAt < Date.now()) return false;
  return entry.userId === userId;
}

// --- CBOR (RFC 8949), только то, что встречается в WebAuthn ---
function decodeCbor(buf) {
  let pos = 0;
  function readLength(info) {
    if (info < 24) return info;
    if (info === 24) return buf.readUInt8(pos++);
    if (info === 25) {
      const v = buf.readUInt16BE(pos);
      pos += 2;
      return v;
    }
    if (info === 26) {
      const v = buf.readUInt32BE(pos);
      pos += 4;
      return v;
    }
    if (info === 27) {
      const v = Number(buf.readBigUInt64BE(pos));
      pos += 8;
      return v;
    }
    throw new Error("unsupported CBOR length");
  }
  function item(depth) {
    if (depth > 16) throw new Error("CBOR too deep");
    if (pos >= buf.length) throw new Error("CBOR truncated");
    const head = buf.readUInt8(pos++);
    const major = head >> 5;
    const info = head & 31;
    switch (major) {
      case 0:
        return readLength(info);
      case 1:
        return -1 - readLength(info);
      case 2: {
        const len = readLength(info);
        if (pos + len > buf.length) throw new Error("CBOR truncated");
        const out = buf.subarray(pos, pos + len);
        pos += len;
        return out;
      }
      case 3: {
        const len = readLength(info);
        if (pos + len > buf.length) throw new Error("CBOR truncated");
        const out = buf.toString("utf8", pos, pos + len);
        pos += len;
        return out;
      }
      case 4: {
        const len = readLength(info);
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(item(depth + 1));
        return arr;
      }
      case 5: {
        const len = readLength(info);
        const map = new Map();
        for (let i = 0; i < len; i++) {
          const k = item(depth + 1);
          map.set(k, item(depth + 1));
        }
        return map;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        throw new Error("unsupported CBOR simple value");
      default:
        throw new Error("unsupported CBOR type");
    }
  }
  const value = item(0);
  return { value, length: pos };
}

// COSE_Key -> JWK (ES256 и RS256 — то, что просим в pubKeyCredParams).
function coseToJwk(cose) {
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) throw new Error("bad EC key");
    return { alg: -7, jwk: { kty: "EC", crv: "P-256", x: b64url(x), y: b64url(y) } };
  }
  if (kty === 3 && alg === -257) {
    const n = cose.get(-1);
    const e = cose.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e)) throw new Error("bad RSA key");
    return { alg: -257, jwk: { kty: "RSA", n: b64url(n), e: b64url(e) } };
  }
  throw new Error("Этот тип ключа не поддерживается");
}

function parseAuthData(buf, { withCredential = false } = {}) {
  if (buf.length < 37) throw new Error("authData too short");
  const rpIdHash = buf.subarray(0, 32);
  const flags = buf.readUInt8(32);
  const signCount = buf.readUInt32BE(33);
  const out = { rpIdHash, flags, signCount, userPresent: !!(flags & 0x01), userVerified: !!(flags & 0x04) };
  if (withCredential) {
    if (!(flags & 0x40)) throw new Error("no attested credential");
    let pos = 37 + 16; // aaguid
    const idLen = buf.readUInt16BE(pos);
    pos += 2;
    if (idLen > 1023 || pos + idLen > buf.length) throw new Error("bad credential id");
    out.credentialId = b64url(buf.subarray(pos, pos + idLen));
    pos += idLen;
    const { value } = decodeCbor(buf.subarray(pos));
    if (!(value instanceof Map)) throw new Error("bad public key");
    out.publicKey = coseToJwk(value);
  }
  return out;
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest();
}

function checkClientData(clientDataB64, { type, origin }) {
  const raw = fromB64url(clientDataB64);
  let data;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("bad clientDataJSON");
  }
  if (data.type !== type) throw new Error("wrong ceremony type");
  if (data.origin !== origin) throw new Error("wrong origin");
  if (typeof data.challenge !== "string") throw new Error("no challenge");
  return { raw, challenge: data.challenge };
}

function sameHash(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Регистрация: возвращает { credentialId, publicKey: {alg, jwk}, signCount }.
function verifyRegistration({ clientDataJSON, attestationObject }, { origin, rpId, userId }) {
  const { challenge } = checkClientData(clientDataJSON, { type: "webauthn.create", origin });
  if (!takeChallenge(challenge, "register", userId)) throw new Error("Запрос устарел — попробуйте ещё раз");
  const { value: att } = decodeCbor(fromB64url(attestationObject));
  if (!(att instanceof Map) || !Buffer.isBuffer(att.get("authData"))) throw new Error("bad attestationObject");
  const auth = parseAuthData(att.get("authData"), { withCredential: true });
  if (!sameHash(auth.rpIdHash, sha256(rpId))) throw new Error("wrong rpId");
  if (!auth.userPresent) throw new Error("user not present");
  return { credentialId: auth.credentialId, publicKey: auth.publicKey, signCount: auth.signCount };
}

// Вход: проверяет подпись ключом passkey. Возвращает новый signCount.
function verifyAssertion({ clientDataJSON, authenticatorData, signature }, { origin, rpId, passkey }) {
  const { raw, challenge } = checkClientData(clientDataJSON, { type: "webauthn.get", origin });
  if (!takeChallenge(challenge, "login", null)) throw new Error("Запрос устарел — попробуйте ещё раз");
  const authBuf = fromB64url(authenticatorData);
  const auth = parseAuthData(authBuf);
  if (!sameHash(auth.rpIdHash, sha256(rpId))) throw new Error("wrong rpId");
  if (!auth.userPresent) throw new Error("user not present");

  const { alg, jwk } = passkey.publicKey;
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const signed = Buffer.concat([authBuf, sha256(raw)]);
  const sig = fromB64url(signature);
  const ok =
    alg === -7
      ? crypto.verify("sha256", signed, { key, dsaEncoding: "der" }, sig)
      : crypto.verify("sha256", signed, { key, padding: crypto.constants.RSA_PKCS1_PADDING }, sig);
  if (!ok) throw new Error("bad signature");
  // Счётчик у копии ключа отстаёт — признак клонирования. 0 у обоих — ключ
  // счётчик не ведёт (так делают синхронизируемые passkeys).
  if ((auth.signCount || passkey.signCount) && auth.signCount <= passkey.signCount) throw new Error("signCount went backwards");
  return { signCount: auth.signCount };
}

function rpFor(req) {
  const host = req.get("host") ?? "";
  return { rpId: host.replace(/:\d+$/, ""), origin: `${req.protocol}://${host}` };
}

module.exports = { b64url, newChallenge, verifyRegistration, verifyAssertion, rpFor, decodeCbor, parseAuthData };
