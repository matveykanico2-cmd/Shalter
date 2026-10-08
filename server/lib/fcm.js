// Push в Android-приложение (Capacitor) через Firebase Cloud Messaging, HTTP v1.
// Веб-push (VAPID) в WebView приложения не работает — нужен токен устройства FCM.
//
// Настройка: сервисный аккаунт Firebase (Консоль → Настройки проекта → Сервисные
// аккаунты → «Создать закрытый ключ»), JSON-файл — путь в FIREBASE_SERVICE_ACCOUNT
// (или сам JSON в FIREBASE_SERVICE_ACCOUNT_JSON). Без него FCM просто выключен.
const crypto = require("crypto");
const fs = require("fs");

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

let account;
function serviceAccount() {
  if (account !== undefined) return account;
  account = null;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (process.env.FIREBASE_SERVICE_ACCOUNT && fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT, "utf8"));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.client_email && parsed.private_key && parsed.project_id) account = parsed;
      else console.error("[fcm] в сервисном аккаунте нет client_email/private_key/project_id");
    }
  } catch (err) {
    console.error("[fcm] не удалось прочитать сервисный аккаунт:", err.message);
  }
  return account;
}

function isFcmConfigured() {
  return !!serviceAccount();
}

const b64url = (data) => Buffer.from(data).toString("base64url");

// OAuth-токен Google по JWT сервисного аккаунта; живёт час, обновляем заранее.
let cachedToken = null;
async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })
  )}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`oauth ${res.status}: ${data.error_description || data.error || "нет токена"}`);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

// Тот же payload, что и у веб-push (sw.js): { title, body, url, tag, kind, … }.
// Все поля — в data (строками), чтобы приложение знало, куда вести по нажатию;
// заголовок и текст — ещё и в notification, чтобы Android показал их сам, даже
// когда приложение закрыто. Возвращает "gone", если токен устарел и его пора удалить.
async function sendFcm(token, payload, { ttlSeconds = 24 * 60 * 60 } = {}) {
  const sa = serviceAccount();
  if (!sa) return "skipped";
  const data = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (v == null) continue;
    data[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  const isCall = payload?.kind === "call";
  const message = {
    token,
    data,
    android: {
      priority: "high",
      ttl: `${ttlSeconds}s`,
      ...(payload?.title
        ? {
            notification: {
              title: String(payload.title).slice(0, 200),
              body: String(payload.body ?? "").slice(0, 1000),
              tag: payload.tag ? String(payload.tag).slice(0, 100) : undefined,
              channel_id: isCall ? "calls" : "messages",
              default_sound: true,
              notification_priority: isCall ? "PRIORITY_MAX" : "PRIORITY_HIGH",
            },
          }
        : {}),
    },
  };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (res.ok) return "sent";
  const err = await res.json().catch(() => ({}));
  const code = err.error?.details?.find?.((d) => d.errorCode)?.errorCode || err.error?.status;
  if (res.status === 404 || code === "UNREGISTERED" || code === "INVALID_ARGUMENT") return "gone";
  throw new Error(`fcm ${res.status}: ${err.error?.message || code || "ошибка"}`);
}

module.exports = { sendFcm, isFcmConfigured };
