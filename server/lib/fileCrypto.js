const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Шифрование вложений на диске.
//
// Защищает от того, от чего проверка прав не защищает вовсе: от кражи диска
// или резервной копии, от доступа хостера к носителю, от того, кто унёс папку
// data/. Проверка прав — замок на двери; это — сейф за ней.
//
// Чего оно НЕ даёт, и это надо понимать: от того, у кого есть доступ к
// работающему серверу, оно не спасает — ключ там же, иначе сервер не смог бы
// отдавать файлы. Такую защиту даёт только сквозное шифрование, где ключ
// вообще не покидает устройств собеседников.
//
// Алгоритм — AES-256-CTR, а не привычный GCM, и выбор вынужденный: браузер
// перематывает видео запросами «отдай кусок с середины», а GCM не умеет
// расшифровывать с произвольного места — ему нужен весь поток целиком, чтобы
// проверить целостность. С CTR можно вычислить счётчик для нужного байта и
// начать оттуда. Цена — нет встроенной проверки целостности: шифр защищает от
// чтения, но не докажет, что файл не подменили. Для содержимого, которое и так
// лежит на нашем же диске под проверкой прав, это приемлемый размен; для
// защиты от подмены нужен отдельный отпечаток, и это другая задача.
const MAGIC = Buffer.from("SHENC1");
const IV_LEN = 16;
const HEADER_LEN = MAGIC.length + IV_LEN;

let key = null;

// Ключ берётся из переменной окружения. Если её нет — создаётся файл рядом с
// данными, и это честно хуже: ключ, лежащий на том же диске, что и данные, не
// спасёт от кражи этого диска. Но альтернатива — не шифровать вовсе, а так
// защита хотя бы от копии базы и от чужих глаз в резервной копии работает.
function loadKey(dataDir) {
  if (key) return key;
  const fromEnv = process.env.UPLOADS_KEY;
  if (fromEnv && /^[0-9a-f]{64}$/i.test(fromEnv)) {
    key = Buffer.from(fromEnv, "hex");
    return key;
  }
  const keyPath = path.join(dataDir, "uploads.key");
  try {
    if (fs.existsSync(keyPath)) {
      key = Buffer.from(fs.readFileSync(keyPath, "utf-8").trim(), "hex");
      if (key.length === 32) return key;
    }
  } catch {
    /* создадим ниже */
  }
  key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
    console.log("[uploads] создан ключ шифрования data/uploads.key — для настоящей защиты вынесите его в UPLOADS_KEY и удалите файл");
  } catch (err) {
    console.error("[uploads] не удалось сохранить ключ шифрования:", err.message);
  }
  return key;
}

// Поток, который шифрует по пути на диск. Заголовок (метка и вектор) пишется
// первым, чтобы при чтении было понятно, зашифрован файл или лежит с тех
// времён, когда шифрования не было.
function createEncryptStream(dataDir, out) {
  const k = loadKey(dataDir);
  const iv = crypto.randomBytes(IV_LEN);
  out.write(Buffer.concat([MAGIC, iv]));
  return crypto.createCipheriv("aes-256-ctr", k, iv);
}

// Зашифрован ли файл: читаем метку в начале. Старые файлы отдаются как есть —
// перешифровывать уже лежащее не нужно, они просто останутся незашифрованными.
function readHeader(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(HEADER_LEN);
    const read = fs.readSync(fd, buf, 0, HEADER_LEN, 0);
    if (read < HEADER_LEN || !buf.subarray(0, MAGIC.length).equals(MAGIC)) return null;
    return { iv: buf.subarray(MAGIC.length, HEADER_LEN) };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

// Счётчик для нужного байта: CTR шифрует блоками по 16, и чтобы начать с
// середины, вектор увеличивается на число пройденных блоков.
function counterAt(iv, byteOffset) {
  const counter = Buffer.from(iv);
  let blocks = Math.floor(byteOffset / 16);
  for (let i = counter.length - 1; i >= 0 && blocks > 0; i--) {
    const sum = counter[i] + (blocks % 256);
    counter[i] = sum % 256;
    blocks = Math.floor(blocks / 256) + (sum > 255 ? 1 : 0);
  }
  return counter;
}

// Расшифровщик, настроенный на чтение с позиции start в исходном файле.
function createDecryptStream(dataDir, iv, start) {
  const k = loadKey(dataDir);
  const decipher = crypto.createDecipheriv("aes-256-ctr", k, counterAt(iv, start));
  // Внутри блока смещение добирается вхолостую: пропускаем столько байт,
  // сколько прошло от начала блока.
  const skip = start % 16;
  if (skip) decipher.update(Buffer.alloc(skip));
  return decipher;
}

module.exports = { createEncryptStream, createDecryptStream, readHeader, HEADER_LEN, loadKey };
