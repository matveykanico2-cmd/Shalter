const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { sendDirect } = require("./directMail");

const SMTP_URL = process.env.SMTP_URL || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const MAIL_FROM = process.env.MAIL_FROM || "Shalter <no-reply@your-domain.example>";
const configured = !!(SMTP_URL || SMTP_HOST);

const OUTBOX_DIR = path.join(process.cwd(), "data", "outbox");
const outboxAllowed =
  process.env.MAIL_OUTBOX === "0" ? false : process.env.NODE_ENV !== "production" || process.env.MAIL_OUTBOX === "1";

function senderAddress() {
  return (MAIL_FROM.match(/<([^>]+)>/) || [null, MAIL_FROM])[1].trim();
}

const SMTP_TIMEOUTS = { connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 };
const SMTP_SECURITY = { requireTLS: true };
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

function withDeadline(promise, ms, what) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what}: сервер не ответил за ${Math.round(ms / 1000)} с`)), ms);
    }),
  ]);
}

async function sendMail({ to, subject, text }) {
  let tx = null;
  try {
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
      console.error("mail send failed:", err.message);
      return { delivered: false, reason: err.message };
    }
  }

  if (process.env.MAIL_DIRECT === "0") return outboxOrFail(to, subject, text, "direct-disabled");
  const direct = await sendDirect({ from: senderAddress(), to, subject, text });
  if (direct.delivered) {
    console.log(`[mail] отправлено напрямую через ${direct.host}: ${direct.response}`);
    return { delivered: true, direct: true };
  }
  console.warn(`[mail] прямая доставка на ${to} не удалась: ${direct.reason}`);

  return outboxOrFail(to, subject, text, direct.reason);
}

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
