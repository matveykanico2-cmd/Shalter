const dns = require("dns").promises;
const net = require("net");
const tls = require("tls");
const os = require("os");
const crypto = require("crypto");
const dkim = require("./dkim");

const MAIL_FROM = process.env.MAIL_FROM || "Shalter <no-reply@your-domain.example>";
const HELO =
  process.env.MAIL_HELO ||
  ((MAIL_FROM.match(/<([^>]+)>/) || [null, MAIL_FROM])[1].split("@")[1] || "shalter.ru").trim();
const TIMEOUT_MS = 20000;

function mxHostsFor(address) {
  const domain = String(address).split("@")[1];
  if (!domain) throw new Error("некорректный адрес");
  return dns.resolveMx(domain).then((rows) =>
    rows.sort((a, b) => a.priority - b.priority).map((r) => r.exchange)
  );
}

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

  const domain = (String(from).split("@")[1] || HELO).trim();
  let signature = null;
  try {
    signature = dkim.sign({ headers, body, domain });
  } catch (err) {
    console.warn("[dkim] подписать письмо не удалось:", err.message);
  }

  return [...(signature ? [signature] : []), ...headers.map(([name, value]) => `${name}: ${value}`), "", body].join("\r\n");
}

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
      errors.push(err.message || `${host}: соединение оборвалось`);
    }
  }
  return { delivered: false, reason: errors.filter(Boolean).join(" | ") || "не удалось соединиться ни с одним сервером получателя" };
}

module.exports = { sendDirect, __buildMessage: buildMessage };
