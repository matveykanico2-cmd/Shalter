const crypto = require("crypto");
const db = require("../db");

const SELECTOR = process.env.DKIM_SELECTOR || "shalter";

let cached = null;

function loadKeys() {
  if (cached) return cached;
  let row = db.prepare("SELECT selector, publicKey, privateKey FROM dkim_keys WHERE id = 1").get();
  if (!row) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    db.prepare("INSERT INTO dkim_keys (id, selector, publicKey, privateKey) VALUES (1, ?, ?, ?)").run(SELECTOR, publicKey, privateKey);
    row = { selector: SELECTOR, publicKey, privateKey };
    console.log(`[dkim] сгенерирован ключ подписи (селектор ${SELECTOR}) — запустите "npm run mail-dns", чтобы получить DNS-запись`);
  }
  cached = row;
  return cached;
}

function publicRecord() {
  const { selector, publicKey } = loadKeys();
  const key = publicKey.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  return { name: `${selector}._domainkey`, value: `v=DKIM1; k=rsa; p=${key}` };
}

function canonicalizeHeader(name, value) {
  const folded = String(value).replace(/\r\n[ \t]+/g, " ");
  return `${name.toLowerCase()}:${folded.replace(/[ \t]+/g, " ").trim()}\r\n`;
}

function canonicalizeBody(body) {
  const lines = String(body)
    .split("\r\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/[ \t]+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? `${lines.join("\r\n")}\r\n` : "";
}

function sign({ headers, body, domain }) {
  const { selector, privateKey } = loadKeys();
  const bodyHash = crypto.createHash("sha256").update(canonicalizeBody(body), "utf8").digest("base64");
  const names = headers.map(([name]) => name);

  const tags =
    `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${domain}; s=${selector}; ` +
    `t=${Math.floor(Date.now() / 1000)}; h=${names.join(":")}; bh=${bodyHash}; b=`;

  const signedData =
    headers.map(([name, value]) => canonicalizeHeader(name, value)).join("") +
    canonicalizeHeader("DKIM-Signature", tags).replace(/\r\n$/, "");

  const signature = crypto.createSign("sha256").update(signedData, "utf8").sign(privateKey, "base64");
  return `DKIM-Signature: ${tags}${signature}`;
}

module.exports = { sign, publicRecord, SELECTOR };
