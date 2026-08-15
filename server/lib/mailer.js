const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

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
const outboxAllowed = process.env.NODE_ENV !== "production" || process.env.MAIL_OUTBOX === "1";

let transport = null;
function getTransport() {
  if (!configured) return null;
  if (!transport) {
    transport = SMTP_URL
      ? nodemailer.createTransport(SMTP_URL)
      : nodemailer.createTransport({
          host: SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: (Number(process.env.SMTP_PORT) || 587) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        });
  }
  return transport;
}

// Never throws: a failed letter must not take down the request that triggered
// it. The caller gets told whether it went, and decides what to say.
async function sendMail({ to, subject, text }) {
  const tx = getTransport();
  if (tx) {
    try {
      await tx.sendMail({ from: MAIL_FROM, to, subject, text });
      return { delivered: true };
    } catch (err) {
      console.error("mail send failed:", err.message);
      return { delivered: false, reason: "send-failed" };
    }
  }

  if (!outboxAllowed) return { delivered: false, reason: "not-configured" };

  try {
    fs.mkdirSync(OUTBOX_DIR, { recursive: true });
    const file = path.join(OUTBOX_DIR, `${Date.now()}_${to.replace(/[^a-z0-9]/gi, "_")}.eml`);
    fs.writeFileSync(file, `To: ${to}\nFrom: ${MAIL_FROM}\nSubject: ${subject}\n\n${text}\n`, "utf8");
    console.log(`[mail] SMTP не настроен — письмо для ${to} записано в ${file}`);
    return { delivered: true, outbox: file };
  } catch (err) {
    console.error("mail outbox failed:", err.message);
    return { delivered: false, reason: "outbox-failed" };
  }
}

module.exports = { sendMail, isMailConfigured: () => configured || outboxAllowed };
