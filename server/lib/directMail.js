const dns = require("dns").promises;
const net = require("net");
const tls = require("tls");
const os = require("os");
const crypto = require("crypto");
const dkim = require("./dkim");

// Delivering a letter straight to the recipient's own mail server, with no
// account anywhere in between.
//
// Why this exists: every ordinary way to send mail needs credentials from
// somebody — a mailbox, an API key, a contract. This path needs none. It does
// what a mail server does: look up the MX records for the recipient's domain,
// open port 25, and hand the message over.
//
// What it costs, stated here because it decides whether the code arrives:
//
//   * Nothing signs the message. Without SPF, DKIM and a matching reverse DNS
//     for the sending IP, receiving servers treat it as suspicious — most will
//     accept it and file it under spam, some will refuse it outright. It is a
//     working fallback, not a replacement for a real sender.
//   * Many hosting providers block outbound port 25 entirely. Then this cannot
//     work at all and the error says so.
//
// SMTP proper is still the preferred path (see mailer.js); this is what happens
// when nothing is configured, so that recovery works out of the box.
//
// Measured, not assumed: from a machine with no reverse DNS, Gmail refuses this
// outright with "550 5.7.25 ... sender-guidelines" before the message body is
// even offered. A server whose provider has set any PTR for its address usually
// gets past that check. Which of the two a given deployment is cannot be known
// from here — hence the error is passed through verbatim to whoever is looking.

const HELO = process.env.MAIL_HELO || "shalter.ru";
const TIMEOUT_MS = 20000;

function mxHostsFor(address) {
  const domain = String(address).split("@")[1];
  if (!domain) throw new Error("некорректный адрес");
  return dns.resolveMx(domain).then((rows) =>
    rows.sort((a, b) => a.priority - b.priority).map((r) => r.exchange)
  );
}

// A UTF-8 subject has to be encoded, or servers see raw bytes in a header that
// is only allowed to be ASCII.
function encodeHeader(text) {
  return `=?UTF-8?B?${Buffer.from(String(text), "utf8").toString("base64")}?=`;
}

function buildMessage({ from, to, subject, text }) {
  const id = `<${crypto.randomBytes(12).toString("hex")}@${HELO}>`;
  const body = Buffer.from(String(text), "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const headers = [
    ["From", from],
    ["To", to],
    ["Subject", encodeHeader(subject)],
    ["Date", new Date().toUTCString()],
    ["Message-ID", id],
    ["MIME-Version", "1.0"],
    ["Content-Type", "text/plain; charset=utf-8"],
    ["Content-Transfer-Encoding", "base64"],
  ];

  // Signed with the domain's own key (lib/dkim.js). Without this the letter is
  // anonymous and strict receivers refuse it outright; with it — and the
  // matching TXT record published — it is provably from this domain. Signing
  // costs nothing when the record is missing, so it is unconditional.
  const domain = (String(from).split("@")[1] || HELO).trim();
  let signature = null;
  try {
    signature = dkim.sign({ headers, body, domain });
  } catch (err) {
    // A letter that goes unsigned still reaches lenient providers, so a signing
    // failure must not become a failure to send.
    console.warn("[dkim] подписать письмо не удалось:", err.message);
  }

  return [...(signature ? [signature] : []), ...headers.map(([name, value]) => `${name}: ${value}`), "", body].join("\r\n");
}

// One conversation with one server. Resolves with the final response, rejects
// with whatever the server refused at.
function talk(host, { from, to, subject, text }) {
  return new Promise((resolve, reject) => {
    let socket = net.createConnection({ host, port: 25 });
    let secured = false;
    let buffer = "";
    let step = 0;
    let finished = false;

    const done = (err, value) => {
      if (finished) return;
      finished = true;
      try {
        socket.destroy();
      } catch {}
      err ? reject(err) : resolve(value);
    };

    const timer = setTimeout(() => done(new Error(`таймаут при разговоре с ${host}`)), TIMEOUT_MS);

    const send = (line) => socket.write(line + "\r\n");

    // The steps, in order. STARTTLS is attempted once: plain-text delivery still
    // works without it, but most servers prefer it and some score it.
    const script = () => [
      { expect: 220, run: () => send(`EHLO ${HELO}`) },
      { expect: 250, run: () => (secured ? send(`MAIL FROM:<${from}>`) : send("STARTTLS")) },
      ...(secured ? [] : [{ expect: 220, run: () => upgrade() }]),
    ];

    function upgrade() {
      const plain = socket;
      plain.removeAllListeners("data");
      socket = tls.connect({ socket: plain, servername: host, rejectUnauthorized: false }, () => {
        secured = true;
        step = 0;
        buffer = "";
        attach();
        send(`EHLO ${HELO}`);
      });
      socket.on("error", (e) => done(e));
    }

    // After the handshake the conversation is the same either way.
    const afterEhlo = [
      () => send(`MAIL FROM:<${from}>`),
      () => send(`RCPT TO:<${to}>`),
      () => send("DATA"),
      () => socket.write(buildMessage({ from, to, subject, text }).replace(/\r\n\./g, "\r\n..") + "\r\n.\r\n"),
      () => send("QUIT"),
    ];

    function attach() {
      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        // A multi-line reply keeps going while the code is followed by "-".
        const lines = buffer.split("\r\n").filter(Boolean);
        const last = lines[lines.length - 1] ?? "";
        if (!/^\d{3} /.test(last)) return;
        buffer = "";
        const code = Number(last.slice(0, 3));
        handle(code, last);
      });
      socket.on("error", (e) => done(e));
      socket.on("timeout", () => done(new Error("таймаут соединения")));
      socket.setTimeout(TIMEOUT_MS);
    }

    let phase = "greeting";
    function handle(code, line) {
      if (code >= 400) return done(new Error(`${host}: ${line}`));

      if (phase === "greeting") {
        phase = "ehlo";
        return send(`EHLO ${HELO}`);
      }
      if (phase === "ehlo") {
        if (!secured && /STARTTLS/i.test(line + buffer)) {
          phase = "starttls";
          return send("STARTTLS");
        }
        phase = "body";
        step = 0;
        return afterEhlo[step++]();
      }
      if (phase === "starttls") {
        phase = "greeting";
        return upgrade();
      }
      if (phase === "body") {
        if (step >= afterEhlo.length) {
          clearTimeout(timer);
          return done(null, { host, response: line });
        }
        return afterEhlo[step++]();
      }
    }

    attach();
  });
}

// Tries each MX in priority order — a domain lists several precisely so that one
// being down isn't a lost letter.
async function sendDirect({ from, to, subject, text }) {
  let hosts;
  try {
    hosts = await mxHostsFor(to);
  } catch (err) {
    return { delivered: false, reason: `нет MX-записей для ${String(to).split("@")[1]}` };
  }
  if (!hosts.length) return { delivered: false, reason: "домен получателя не принимает почту" };

  const errors = [];
  for (const host of hosts.slice(0, 3)) {
    try {
      const res = await talk(host, { from, to, subject, text });
      return { delivered: true, host, response: res.response };
    } catch (err) {
      // Never an empty string: this reason is the only diagnosis anyone gets
      // when a recovery code doesn't arrive.
      errors.push(err.message || `${host}: соединение оборвалось`);
    }
  }
  return { delivered: false, reason: errors.filter(Boolean).join(" | ") || "не удалось соединиться ни с одним сервером получателя" };
}

// __buildMessage is exported for testing only: a DKIM signature that is subtly
// wrong is worse than none at all, and the only way to know it is right is to
// verify the assembled message the way a receiver does.
module.exports = { sendDirect, __buildMessage: buildMessage };
