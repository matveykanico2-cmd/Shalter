// Real Web Push (works even with the tab/browser fully closed), not just the
// foreground Notification API. VAPID keys are generated once and persisted
// in the vapid_keys table — a push subscription is bound to the server's
// public key, so regenerating them on every restart would silently break
// every subscription made so far.
const webpush = require("web-push");
const db = require("./db");
const { listSubscriptionsForUser, removeSubscriptionByEndpoint } = require("./data/pushSubscriptions");

let publicKey = null;

async function initPush() {
  let keys = db.prepare("SELECT publicKey, privateKey FROM vapid_keys WHERE id = 1").get();
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys();
    db.prepare(
      `INSERT INTO vapid_keys (id, publicKey, privateKey) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET publicKey = excluded.publicKey, privateKey = excluded.privateKey`
    ).run(keys.publicKey, keys.privateKey);
  }
  publicKey = keys.publicKey;
  webpush.setVapidDetails("mailto:push@example.com", keys.publicKey, keys.privateKey);
}

function getPublicKey() {
  return publicKey;
}

// Sends to every subscription registered for this user (multiple
// devices/browsers), pruning any the push service reports as gone
// (404/410 — uninstalled browser, revoked permission, expired subscription)
// so they don't fail forever on every future send.
// options — то, что видит служба доставки (Google, Apple, Mozilla), а не наш
// обработчик: срок жизни и срочность.
//
// Без них уходили значения по умолчанию: TTL четыре недели и обычная
// срочность. Для переписки это терпимо, для звонка — нет. Телефон в
// энергосбережении копит обычные уведомления и отдаёт их пачкой, когда
// проснётся; звонок в такой пачке приезжает через час, показывает «вам
// звонят», и человек жмёт «Ответить» на разговор, который давно закончился.
//
// Так это устроено и в других мессенджерах: звонок — срочно и ненадолго,
// сообщение — обычным порядком, но храни, пока не доставишь.
async function sendPushToUser(userId, payload, options = {}) {
  const subs = await listSubscriptionsForUser(userId);
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, body, options);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await removeSubscriptionByEndpoint(row.subscription.endpoint);
        } else {
          console.error("push send failed:", err.statusCode, err.body || err.message);
        }
      }
    })
  );
}

// Готовые наборы, чтобы срочность не приходилось вспоминать на каждом вызове.
//
// Звонок живёт около минуты: доставить его позже — значит соврать. Служба
// доставки выбросит просроченное сама, и это правильнее, чем показать человеку
// звонок из прошлого.
const CALL_PUSH = { urgency: "high", TTL: 45 };
// Отмена звонка ещё короче: если её не доставили сразу, то и отменять уже
// нечего — само уведомление о звонке к тому времени тоже просрочено.
const CALL_CANCEL_PUSH = { urgency: "high", TTL: 30 };
// Сообщение подождёт: телефон был вне сети — покажем, когда вернётся.
const MESSAGE_PUSH = { urgency: "normal", TTL: 24 * 60 * 60 };

module.exports = { initPush, getPublicKey, sendPushToUser, CALL_PUSH, CALL_CANCEL_PUSH, MESSAGE_PUSH };
