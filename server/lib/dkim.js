const crypto = require("crypto");
const db = require("../db");

// DKIM: a cryptographic signature on every outgoing letter, proving the message
// really was authorized by whoever owns the sending domain.
//
// This is the one thing that decides whether Gmail accepts mail at all. Google
// answers an unsigned, unvouched-for sender with "550 5.7.26 ... this mail has
// been blocked because the sender is unauthenticated" before the body is even
// offered — measured, not assumed (see lib/directMail.js). SPF would satisfy the
// same requirement, but SPF is *only* a DNS record and nothing else; DKIM is
// half code, and the half that is code is done here so that the remaining half
// is a single TXT record to paste (scripts/mail-dns.js prints it verbatim).
//
// The keypair is generated once, on first use, and kept in the database. It is
// deliberately never rotated automatically: the public half sits in DNS, so a
// fresh key would invalidate every signature until someone updates the record —
// silent breakage of exactly the flow this exists to protect.

const SELECTOR = process.env.DKIM_SELECTOR || "shalter";

let cached = null;

function loadKeys() {
  if (cached) return cached;
  let row = db.prepare("SELECT selector, publicKey, privateKey FROM dkim_keys WHERE id = 1").get();
  if (!row) {
    // 2048 bits: the size every receiver accepts. 1024 is treated as weak by
    // some, 4096 overflows the 255-character limit on a single TXT string and
    // then needs splitting, which is a common way for these records to be
    // pasted in wrong.
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

// The public half as it goes into DNS: the PEM stripped of its armour and
// newlines, wrapped in the v=DKIM1 record syntax.
function publicRecord() {
  const { selector, publicKey } = loadKeys();
  const key = publicKey.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  return { name: `${selector}._domainkey`, value: `v=DKIM1; k=rsa; p=${key}` };
}

// RFC 6376 "relaxed" canonicalization. Both halves matter: the receiver
// recomputes the hash over these exact normalizations, so anything off by one
// space produces a signature that verifies as invalid — which is worse than no
// signature at all.
function canonicalizeHeader(name, value) {
  const folded = String(value).replace(/\r\n[ \t]+/g, " "); // unfold continuation lines
  return `${name.toLowerCase()}:${folded.replace(/[ \t]+/g, " ").trim()}\r\n`;
}

function canonicalizeBody(body) {
  const lines = String(body)
    .split("\r\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/[ \t]+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop(); // trailing empty lines are not signed
  return lines.length ? `${lines.join("\r\n")}\r\n` : "";
}

// Signs a built message and returns it with a DKIM-Signature header on top.
// `headers` is the ordered [name, value] list the message was built from, so the
// h= tag names exactly what is there — signing a header that is absent, or
// naming them in a different order than they were hashed, both invalidate.
function sign({ headers, body, domain }) {
  const { selector, privateKey } = loadKeys();
  const bodyHash = crypto.createHash("sha256").update(canonicalizeBody(body), "utf8").digest("base64");
  const names = headers.map(([name]) => name);

  // b= is empty while the signature header itself is being hashed — the
  // receiver does the same, which is how a header can sign itself.
  const tags =
    `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${domain}; s=${selector}; ` +
    `t=${Math.floor(Date.now() / 1000)}; h=${names.join(":")}; bh=${bodyHash}; b=`;

  const signedData =
    headers.map(([name, value]) => canonicalizeHeader(name, value)).join("") +
    // The trailing CRLF is omitted for the signature header only.
    canonicalizeHeader("DKIM-Signature", tags).replace(/\r\n$/, "");

  const signature = crypto.createSign("sha256").update(signedData, "utf8").sign(privateKey, "base64");
  return `DKIM-Signature: ${tags}${signature}`;
}

module.exports = { sign, publicRecord, SELECTOR };
