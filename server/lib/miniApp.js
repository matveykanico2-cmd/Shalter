// Мини-приложения ботов: обычная веб-страница на сервере автора, которая
// открывается внутри Shalter (public/js/components/miniApp.js — тот же
// встроенный браузер, что и для ссылок, только с мостом наружу) и знает, кто
// именно её открыл.
//
// Всё держится на одном: странице нельзя верить. Она живёт на чужом домене, и
// «я Вася, дай мне заказы Васи» из неё написать может кто угодно. Поэтому имя
// открывшего не передаётся страницей — оно подписывается здесь ключом, который
// знают только сервер и владелец бота (его токен), и бот проверяет подпись у
// себя. Схема ровно та же, что в Telegram Mini Apps: строка вида
// `user=...&auth_date=...&hash=...`, где hash — HMAC-SHA256 от остальных полей,
// отсортированных по имени. Совпадает с привычной, потому что человек, который
// уже писал такое для Telegram, перепишет проверку в две минуты, а не будет
// разбираться в новом изобретении.
const crypto = require("crypto");

// Ключ подписи выводится из токена бота, а не берётся им напрямую: так утечка
// initData (а она уходит в чужой браузер) не отдаёт сам токен, которым можно
// отправлять сообщения от имени бота.
const SECRET_SALT = "ShalterWebAppData";

function secretKey(token) {
  return crypto.createHmac("sha256", SECRET_SALT).update(token).digest();
}

// Строка для подписи: пары «ключ=значение», кроме hash, отсортированные по
// ключу и склеенные переводом строки. Порядок обязателен — иначе две стороны
// посчитают HMAC от разного текста.
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

// Что получает страница. Намеренно немного: кто открыл, откуда и когда. Ни
// номера телефона, ни списка чатов, ни почты — приложению бота они не нужны, а
// initData уходит в чужой браузер и остаётся в его истории.
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

// Обратная сторона — то, что вызывает бот. maxAgeSec отсекает старую подпись,
// подсмотренную в чужой истории браузера: сама по себе она верна вечно.
function verifyInitData(token, initData, { maxAgeSec = 24 * 60 * 60 } = {}) {
  if (!token || typeof initData !== "string" || !initData) return { ok: false, error: "initData is empty" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "no hash in initData" };

  const expected = signParams(params, token);
  // Сравнение постоянного времени: обычное === на строках выходит по первому
  // несовпавшему символу и по времени ответа подсказывает, сколько символов
  // подписи уже угаданы.
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

// Адрес приложения проверяется при сохранении, а не при открытии: криво
// введённый адрес должен ругаться в лицо владельцу бота, а не молча выдавать
// пустое окно каждому, кто нажмёт кнопку.
//
// http допускается только для localhost — на нём разрабатывают, и требовать
// сертификат от машины автора значит запретить попробовать вообще.
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

// Кнопка бота может открыть не только корень приложения, но и страницу внутри
// него — а вот чужой сайт не может. Иначе любой бот подписывал бы имя, юзернейм
// и premium-статус того, кто нажал кнопку, и отправлял бы это куда угодно.
function sameApp(appUrl, requestedUrl) {
  try {
    return new URL(appUrl).origin === new URL(requestedUrl).origin;
  } catch {
    return false;
  }
}

// initData кладётся во фрагмент (#), а не в query: фрагмент не уходит на
// сервер в строке запроса и не оседает в его логах — забирает его только js
// самой страницы. Так же это устроено в Telegram.
function buildAppUrl(url, initData, { theme } = {}) {
  const u = new URL(url);
  const fragment = new URLSearchParams(u.hash.replace(/^#/, ""));
  fragment.set("shalterWebApp", initData);
  if (theme) fragment.set("shalterTheme", theme);
  u.hash = fragment.toString();
  return u.toString();
}

module.exports = { buildInitData, verifyInitData, validateAppUrl, sameApp, buildAppUrl };
