// Системное «Поделиться» (Web Share Target): Shalter появляется в меню «Поделиться»
// на телефоне и в браузере, туда можно отдать ссылку, текст или файл.
//
// Браузер шлёт POST с multipart-телом на /share-target и ждёт перехода. Мы разбираем
// тело сами (multer в проекте нет, а тащить зависимость ради одной точки входа
// не хочется), кладём содержимое в короткоживущий ящик и отвечаем 303 на /share/… —
// дальше приложение само спрашивает содержимое и открывает окно отправки.
const crypto = require("crypto");
const express = require("express");

const router = express.Router();

const MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;
const BOX_TTL_MS = 15 * 60 * 1000;

const box = new Map();
function sweep(now) {
  for (const [key, item] of box) if (item.expiresAt <= now) box.delete(key);
}
function put(payload) {
  const now = Date.now();
  sweep(now);
  // Больше 30 нерасходуемых записей — вытесняем самые старые.
  if (box.size >= 30) {
    const oldest = [...box.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt).slice(0, box.size - 29);
    for (const [key] of oldest) box.delete(key);
  }
  const token = crypto.randomBytes(16).toString("hex");
  box.set(token, { payload, expiresAt: now + BOX_TTL_MS });
  return token;
}
function take(token) {
  const item = box.get(token);
  if (!item) return null;
  box.delete(token);
  return item.expiresAt <= Date.now() ? null : item.payload;
}

function parseContentType(header) {
  const raw = String(header ?? "");
  const type = raw.split(";")[0].trim().toLowerCase();
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(raw);
  return { type, boundary: (m?.[1] ?? m?.[2] ?? "").trim() };
}

function parseDisposition(header) {
  const name = /name="([^"]*)"/i.exec(header)?.[1] ?? "";
  const filenameStar = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  const filename = /filename="([^"]*)"/i.exec(header)?.[1];
  return {
    name,
    filename: filenameStar ? decodeURIComponent(filenameStar) : filename ?? "",
  };
}

// Минимальный разбор multipart/form-data: нам нужны только строковые поля и один
// файл. Секции ищем по границам, тело уже лежит в памяти (ограничено сверху).
function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];
  let index = buffer.indexOf(delimiter);
  while (index !== -1) {
    const start = index + delimiter.length;
    if (buffer.slice(start, start + 2).toString() === "--") break; // конец
    const headerEnd = buffer.indexOf("\r\n\r\n", start);
    if (headerEnd === -1) break;
    const headers = buffer.slice(start + 2, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;
    const next = buffer.indexOf(delimiter, bodyStart);
    if (next === -1) break;
    // Перед границей идёт CRLF — не часть содержимого.
    const body = buffer.slice(bodyStart, next - 2);
    const disposition = /content-disposition:([^\r\n]*)/i.exec(headers)?.[1] ?? "";
    const { name, filename } = parseDisposition(disposition);
    const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() ?? "";
    if (name) {
      if (filename) files.push({ name, filename, type, data: body });
      else fields[name] = body.toString("utf8");
    }
    index = next;
  }
  return { fields, files };
}

// Тело разбираем в память, поэтому запросов с одного адреса не больше 20 в минуту.
const HITS = new Map();
function allow(ip) {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 20) {
    HITS.set(ip, recent);
    return false;
  }
  recent.push(now);
  HITS.set(ip, recent);
  if (HITS.size > 5000) HITS.clear();
  return true;
}

router.post(
  "/",
  (req, res, next) => {
    if (!allow(req.ip ?? "?")) return res.status(429).json({ error: "Слишком много отправок — подождите минуту" });
    next();
  },
  express.raw({ type: "*/*", limit: MAX_BODY_BYTES }),
  (req, res) => {
    const { type, boundary } = parseContentType(req.headers["content-type"]);
    let fields = {};
    let files = [];
    if (type.startsWith("multipart/form-data") && boundary) {
      ({ fields, files } = parseMultipart(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), boundary));
    } else {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      for (const [k, v] of new URLSearchParams(raw)) fields[k] = v;
    }

    const text = [fields.title, fields.text, fields.url].filter(Boolean).join("\n").trim().slice(0, MAX_TEXT_CHARS);
    const file = files[0] ? { name: files[0].filename || files[0].name, type: files[0].type, data: files[0].data } : null;
    if (!text && !file) return res.redirect(303, "/");

    const token = put({
      text,
      url: typeof fields.url === "string" && /^https?:\/\//i.test(fields.url) ? fields.url : null,
      file: file && file.data.length ? { name: file.name, type: file.type, base64: file.data.toString("base64") } : null,
    });
    res.redirect(303, `/share/${token}`);
  }
);

module.exports = router;
module.exports.takeSharePayload = take;