const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

// Разбор multipart из server/routes/shareTarget.js вынесён локально: сама функция
// не экспортируется, а поднимать сервер ради проверки не нужно.
const src = fs.readFileSync(path.join(__dirname, "..", "server", "routes", "shareTarget.js"), "utf8");
const snippet = src.slice(src.indexOf("function parseContentType"), src.indexOf("router.post"));
const mod = {};
new Function("exports", "require", "module", "__dirname", `${snippet}; exports.parseContentType = parseContentType; exports.parseMultipart = parseMultipart;`)(
  mod,
  require,
  module,
  __dirname
);

function multipart(boundary, parts) {
  const chunks = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename) head += `; filename="${part.filename}"`;
    head += "\r\n";
    if (part.type) head += `Content-Type: ${part.type}\r\n`;
    chunks.push(Buffer.from(head + "\r\n"), Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value), Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

test("multipart: текстовые поля и файл", () => {
  const boundary = "----shalterTest";
  const body = multipart(boundary, [
    { name: "text", value: "Привет из TikTok" },
    { name: "url", value: "https://www.tiktok.com/@user/video/123" },
    { name: "files", filename: "clip.mp4", type: "video/mp4", value: Buffer.from([0x00, 0xff, 0x10, 0x0d, 0x0a, 0x2d, 0x2d]) },
  ]);
  const { boundary: b } = mod.parseContentType(`multipart/form-data; boundary=${boundary}`);
  assert.equal(b, boundary);
  const { fields, files } = mod.parseMultipart(body, b);
  assert.equal(fields.text, "Привет из TikTok");
  assert.equal(fields.url, "https://www.tiktok.com/@user/video/123");
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, "clip.mp4");
  assert.equal(files[0].type, "video/mp4");
  // Двоичные данные не должны потерять байты и получить лишний CRLF от границы.
  assert.deepEqual([...files[0].data], [0x00, 0xff, 0x10, 0x0d, 0x0a, 0x2d, 0x2d]);
});

test("multipart: без файла и несколько полей с одинаковым именем", () => {
  const boundary = "b1";
  const body = multipart(boundary, [
    { name: "title", value: "Заголовок" },
    { name: "text", value: "один" },
    { name: "text", value: "два" },
  ]);
  const { fields, files } = mod.parseMultipart(body, boundary);
  assert.equal(files.length, 0);
  assert.equal(fields.title, "Заголовок");
  // Последнее значение побеждает — как в обычном разборе форм.
  assert.equal(fields.text, "два");
});

test("multipart: filename* в UTF-8", () => {
  const boundary = "b2";
  const body = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename*=UTF-8''%D0%BA%D0%B0%D1%80%D1%82%D0%B8%D0%BD%D0%BA%D0%B0.png\r\n` +
      `Content-Type: image/png\r\n\r\nDATA\r\n--${boundary}--\r\n`
  );
  const { files } = mod.parseMultipart(body, boundary);
  assert.equal(files[0].filename, "картинка.png");
  assert.equal(files[0].data.toString(), "DATA");
});