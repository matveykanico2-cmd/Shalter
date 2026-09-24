const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const keyring = require("./keyring");

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
//
// Ключи меняются каждые 2 минуты (lib/keyring.js). Файл шифруется ключом,
// действующим в момент загрузки, и номер ключа пишется в заголовок:
//   SHENC2 | номер ключа (4 байта) | вектор (16 байт)
// Файлы старого формата SHENC1 (метка + вектор, один ключ на всё) читаются
// прежним ключом. Длина заголовка поэтому у файлов разная — она приходит в
// header.len, и вызывающий код отступает на неё, а не на константу.
const MAGIC = Buffer.from("SHENC1");
const MAGIC2 = Buffer.from("SHENC2");
const IV_LEN = 16;
const HEADER_LEN_V1 = MAGIC.length + IV_LEN;
const HEADER_LEN_V2 = MAGIC2.length + 4 + IV_LEN;
// Сколько байт прочитать с начала файла, чтобы разобрать любой заголовок.
const HEADER_MAX = HEADER_LEN_V2;

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

// Мастер, которым завёрнуты ротируемые ключи файлов, — выводится из того же
// UPLOADS_KEY / data/uploads.key, так что отдельного секрета не прибавилось.
let fileKek = null;
function loadKek(dataDir) {
  if (!fileKek) fileKek = Buffer.from(crypto.hkdfSync("sha256", loadKey(dataDir), Buffer.alloc(0), "shalter/files/kek", 32));
  return fileKek;
}

// Поток, который шифрует по пути на диск. Заголовок (метка и вектор) пишется
// первым, чтобы при чтении было понятно, зашифрован файл или лежит с тех
// времён, когда шифрования не было.
function createEncryptStream(dataDir, out) {
  const { id, key: k } = keyring.currentKey("files", loadKek(dataDir));
  const iv = crypto.randomBytes(IV_LEN);
  const keyId = Buffer.alloc(4);
  keyId.writeUInt32BE(id);
  out.write(Buffer.concat([MAGIC2, keyId, iv]));
  return crypto.createCipheriv("aes-256-ctr", k, iv);
}

// Разбор заголовка по первым байтам файла: { iv, keyId, len } или null, если
// файл лежит незашифрованным (записан до появления шифрования).
function parseHeader(buf) {
  if (!buf) return null;
  if (buf.length >= HEADER_LEN_V2 && buf.subarray(0, MAGIC2.length).equals(MAGIC2)) {
    return {
      keyId: buf.readUInt32BE(MAGIC2.length),
      iv: Buffer.from(buf.subarray(MAGIC2.length + 4, HEADER_LEN_V2)),
      len: HEADER_LEN_V2,
    };
  }
  if (buf.length >= HEADER_LEN_V1 && buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    return { keyId: null, iv: Buffer.from(buf.subarray(MAGIC.length, HEADER_LEN_V1)), len: HEADER_LEN_V1 };
  }
  return null;
}

// Зашифрован ли файл: читаем метку в начале. Старые файлы отдаются как есть —
// перешифровывать уже лежащее не нужно, они просто останутся незашифрованными.
function readHeader(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(HEADER_MAX);
    const read = fs.readSync(fd, buf, 0, HEADER_MAX, 0);
    return parseHeader(buf.subarray(0, read));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

// То же самое, что readHeader, но по уже прочитанным байтам, а не по пути на
// диске, — нужно для S3 (lib/storage.js): там первые HEADER_MAX байт
// получаются отдельным ranged-запросом, файла на диске нет вовсе.
function headerFromBuffer(buf) {
  return parseHeader(buf);
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
// header — то, что вернули readHeader/headerFromBuffer: по нему выбирается
// ключ (ротируемый по номеру или старый общий).
function createDecryptStream(dataDir, header, start) {
  const k = header.keyId != null ? keyring.getKey("files", header.keyId, loadKek(dataDir)) : loadKey(dataDir);
  const decipher = crypto.createDecipheriv("aes-256-ctr", k, counterAt(header.iv, start));
  // Внутри блока смещение добирается вхолостую: пропускаем столько байт,
  // сколько прошло от начала блока.
  const skip = start % 16;
  if (skip) decipher.update(Buffer.alloc(skip));
  return decipher;
}

module.exports = { createEncryptStream, createDecryptStream, readHeader, headerFromBuffer, HEADER_MAX, loadKey };
