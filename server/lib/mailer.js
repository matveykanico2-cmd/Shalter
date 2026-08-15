const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { sendDirect } = require("./directMail");

// Outgoing e-mail. One place, so every letter this app ever sends is configured
// and formatted the same way.
//
// Configuration is entirely by environment, in the same "unset means the feature
// is simply off" style as LANGUAGETOOL_URL and the VAPID keys:
//
//   SMTP_URL=smtps://user%40domain:app-password@smtp.yandex.ru:465
//   MAIL_FROM="Shalter <no-reply@shalter.ru>"
//
// or, if a URL is awkward to quote:
//
//   SMTP_HOST=smtp.yandex.ru  SMTP_PORT=465  SMTP_USER=…  SMTP_PASS=…
//
// With none of it set, letters are not dropped: sendMail falls through to
// lib/directMail.js, which delivers to the recipient's own mail server itself.
// That reaches some providers and not others — see that file — so SMTP_URL is
// still the configuration worth having.
//
// Deliverability is not decided here: without SPF, DKIM and DMARC on the
// sending domain, a correctly sent letter still lands in spam. That's DNS work,
// not code, and it has to be done once for whatever host ends up in SMTP_URL.

const SMTP_URL = process.env.SMTP_URL || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const MAIL_FROM = process.env.MAIL_FROM || "Shalter <no-reply@shalter.ru>";
const configured = !!(SMTP_URL || SMTP_HOST);

// Without SMTP configured, a letter is written to data/outbox instead of being
// dropped. That's what lets the whole recovery flow be walked end to end on a
// machine with no mail server — and it is deliberately refused in production,
// because these files contain one-time codes in plain text and a production box
// that can't send mail should say so rather than quietly spool secrets to disk.
const OUTBOX_DIR = path.join(process.cwd(), "data", "outbox");
// MAIL_OUTBOX forces the answer either way: "1" allows it in production (a
// deliberate choice for a box that genuinely has no mail route), "0" refuses it
// in development — which is what makes the "nothing could deliver this letter"
// path reachable from a test.
const outboxAllowed =
  process.env.MAIL_OUTBOX === "0" ? false : process.env.NODE_ENV !== "production" || process.env.MAIL_OUTBOX === "1";

// The bare address out of MAIL_FROM ("Shalter <no-reply@shalter.ru>" →
// "no-reply@shalter.ru") — SMTP envelopes take an address, not a display name.
function senderAddress() {
  return (MAIL_FROM.match(/<([^>]+)>/) || [null, MAIL_FROM])[1].trim();
}

// Nodemailer waits two minutes to connect and ten more on a silent socket. That
// is not a timeout, it is a hang: no reverse proxy waits that long, so a server
// whose provider blocks outbound 465 answers the password-recovery request with
// a bare 502 instead of "письмо не ушло" — and the fallback that would have put
// the code in the user's Shalter chat never gets to run. Seconds, not minutes.
const SMTP_TIMEOUTS = { connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 };
// На 587-м порту соединение начинается открытым и шифруется командой STARTTLS.
// Без этого флага nodemailer, не увидев STARTTLS, спокойно продолжит и отправит
// логин с паролем в открытом виде. Пусть лучше откажется отправлять.
const SMTP_SECURITY = { requireTLS: true };
// A ceiling over the whole conversation, since the three above bound only
// individual phases and a slow server could still stack them past a proxy's
// patience. Sized to stay under the usual 60-second gateway timeout.
const SEND_DEADLINE_MS = 25000;

let transport = null;
function getTransport() {
  if (!configured) return null;
  if (!transport) {
    transport = SMTP_URL
      ? nodemailer.createTransport({ url: SMTP_URL, ...SMTP_TIMEOUTS, ...SMTP_SECURITY })
      : nodemailer.createTransport({
          host: SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: (Number(process.env.SMTP_PORT) || 587) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
          ...SMTP_TIMEOUTS,
          ...SMTP_SECURITY,
        });
  }
  return transport;
}

// Never leaves a request hanging on someone else's mail server, whatever the
// library does internally.
function withDeadline(promise, ms, what) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what}: сервер не ответил за ${Math.round(ms / 1000)} с`)), ms);
    }),
  ]);
}

// Never throws: a failed letter must not take down the request that triggered
// it. The caller gets told whether it went, and decides what to say.
async function sendMail({ to, subject, text }) {
  let tx = null;
  try {
    // Building the transport can throw on its own — a malformed SMTP_URL is a
    // typo in configuration, not a reason to fail the whole request with a 500.
    tx = getTransport();
  } catch (err) {
    console.error("mail transport is misconfigured:", err.message);
    return { delivered: false, reason: `настройки SMTP не разобрать: ${err.message}` };
  }
  if (tx) {
    try {
      await withDeadline(tx.sendMail({ from: MAIL_FROM, to, subject, text }), SEND_DEADLINE_MS, "SMTP");
      return { delivered: true };
    } catch (err) {
      // The server's own words, not a label of ours: "535 Authentication
      // failed" and "connect ETIMEDOUT" call for completely different fixes,
      // and a caller that only ever hears "send-failed" cannot tell them apart.
      console.error("mail send failed:", err.message);
      return { delivered: false, reason: err.message };
    }
  }

  // Nothing configured: try to hand the letter to the recipient's own server
  // ourselves (lib/directMail.js). No account, no key, no contract — but also
  // nothing vouching for the sender, so strict providers refuse it. Worth
  // attempting before giving up, because for some recipients it does arrive.
  //
  // MAIL_DIRECT=0 turns it off — a conversation with a remote mail server takes
  // seconds, which is unwanted in an automated test run where the letter is
  // going to be read out of the outbox anyway.
  if (process.env.MAIL_DIRECT === "0") return outboxOrFail(to, subject, text, "direct-disabled");
  const direct = await sendDirect({ from: senderAddress(), to, subject, text });
  if (direct.delivered) {
    console.log(`[mail] отправлено напрямую через ${direct.host}: ${direct.response}`);
    return { delivered: true, direct: true };
  }
  console.warn(`[mail] прямая доставка на ${to} не удалась: ${direct.reason}`);

  return outboxOrFail(to, subject, text, direct.reason);
}

// Last resort: write the letter to disk so a development machine can still walk
// the flow. Refused in production — see OUTBOX_DIR above for why.
function outboxOrFail(to, subject, text, reason) {
  if (!outboxAllowed) return { delivered: false, reason };
  try {
    fs.mkdirSync(OUTBOX_DIR, { recursive: true });
    const file = path.join(OUTBOX_DIR, `${Date.now()}_${to.replace(/[^a-z0-9]/gi, "_")}.eml`);
    fs.writeFileSync(file, `To: ${to}\nFrom: ${MAIL_FROM}\nSubject: ${subject}\n\n${text}\n`, "utf8");
    console.log(`[mail] письмо для ${to} записано в ${file}`);
    return { delivered: true, outbox: file };
  } catch (err) {
    console.error("mail outbox failed:", err.message);
    return { delivered: false, reason: "outbox-failed" };
  }
}

// Opens the connection and authenticates without sending anything — the half of
// "is it my credentials or my code" that can be answered on its own
// (scripts/mail-test.js).
async function verifySmtp() {
  const tx = getTransport();
  if (!tx) return { configured: false };
  try {
    await tx.verify();
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

module.exports = { sendMail, verifySmtp };
