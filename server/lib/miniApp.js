const crypto = require("crypto");

const SECRET_SALT = "ShalterWebAppData";

function secretKey(token) {
  return crypto.createHmac("sha256", SECRET_SALT).update(token).digest();
}

function dataCheckString(params) {
  return [...params.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function signParams(params, token) {
  return crypto.createHmac("sha256", secretKey(token)).update(dataCheckString(params)).digest("hex");
}

function buildInitData({ token, user, chat, botUserId }) {
  const params = new URLSearchParams();
  params.set(
    "user",
    JSON.stringify({
      id: user.id,
      name: user.name,
      username: user.username || null,
      isPremium: !!user.isPremium,
    })
  );
  if (chat?.id) params.set("chat_id", chat.id);
  params.set("bot_id", botUserId);
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("hash", signParams(params, token));
  return params.toString();
}

function verifyInitData(token, initData, { maxAgeSec = 24 * 60 * 60 } = {}) {
  if (!token || typeof initData !== "string" || !initData) return { ok: false, error: "initData is empty" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "no hash in initData" };

  const expected = signParams(params, token);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: "bad hash" };

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) return { ok: false, error: "no auth_date" };
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (maxAgeSec && ageSec > maxAgeSec) return { ok: false, error: "initData expired" };

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    return { ok: false, error: "bad user field" };
  }
  return { ok: true, user, chatId: params.get("chat_id") || null, botId: params.get("bot_id") || null, authDate, ageSec };
}

function validateAppUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { url: null };
  let u;
  try {
    u = new URL(value);
  } catch {
    return { error: "Некорректный адрес приложения" };
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    return { error: "Адрес приложения должен начинаться с https:// (http — только для localhost)" };
  }
  if (u.username || u.password) return { error: "В адресе приложения не должно быть логина и пароля" };
  return { url: u.toString() };
}

function sameApp(appUrl, requestedUrl) {
  try {
    return new URL(appUrl).origin === new URL(requestedUrl).origin;
  } catch {
    return false;
  }
}

function buildAppUrl(url, initData, { theme } = {}) {
  const u = new URL(url);
  const fragment = new URLSearchParams(u.hash.replace(/^#/, ""));
  fragment.set("shalterWebApp", initData);
  if (theme) fragment.set("shalterTheme", theme);
  u.hash = fragment.toString();
  return u.toString();
}

module.exports = { buildInitData, verifyInitData, validateAppUrl, sameApp, buildAppUrl };
