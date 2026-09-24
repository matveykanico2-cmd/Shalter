const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const keyring = require("./keyring");

// Шифрование текста сообщений в базе — то, что Telegram делает с облачными
// чатами: переписка лежит на сервере зашифрованной, а ключ хранится отдельно
// от данных.
//
// От чего защищает: от копии data/app.db — утёкшей резервной копии, снятого
// диска, хостера, заглянувшего в файл. Без ключа там только шифротекст.
// От чего нет: от того, кто управляет работающим сервером, — ключ у сервера
// есть, иначе он не смог бы показывать переписку, искать по ней, делать
// превью ссылок и кормить ботов. Это ровно та же граница, что у облачных
// чатов Telegram (и у lib/fileCrypto.js для вложений).
//
// Алгоритм — AES-256-GCM: в отличие от вложений, текст всегда читается
// целиком, поэтому можно взять режим с проверкой целостности. В AAD идёт id
// сообщения — шифротекст нельзя незаметно переставить из одной строки в
// другую: чужой текст под своим сообщением просто не расшифруется.
//
// Поиск. Полнотекстовый указатель по открытому тексту свёл бы шифрование на
// нет: по нему переписка восстанавливается почти дословно. Поэтому в
// указатель (db.js, messages_search) попадают не слова, а их HMAC-отпечатки
// с отдельным ключом — и для слова целиком, и для его начал, чтобы «сообщ»
// по-прежнему находило «сообщение». Без ключа отпечаток ничего не говорит;
// порядок слов не хранится вовсе (detail=none).
//
// Ключи меняются каждые 2 минуты (lib/keyring.js): новое сообщение шифруется
// действующим ключом, и его номер пишется в саму строку — «enc2:<номер>:…».
// Строки старого формата «enc1:» (один ключ на всё, до появления ротации)
// читаются как раньше.
const PREFIX_V1 = "enc1:";
const PREFIX = "enc2:";
const IV_LEN = 12;
const TAG_LEN = 16;
// Длиннее этого начала слова не индексируются: «интернационализация» ищется
// по первым двадцати буквам, и этого хватает с запасом.
const MAX_PREFIX = 20;

let keys = null;

// Ключ — из MESSAGES_KEY (64 hex-символа), иначе из data/messages.key, который
// создаётся при первом запуске. Как и с uploads.key: файл рядом с базой не
// спасёт от кражи всего диска, для настоящей защиты его надо вынести в
// переменную окружения. Потеря ключа = потеря всей переписки, поэтому он
// должен попадать в резервные копии — но не в ту же, что app.db.
function loadKeys() {
  if (keys) return keys;
  let master = null;
  const fromEnv = process.env.MESSAGES_KEY;
  if (fromEnv && /^[0-9a-f]{64}$/i.test(fromEnv)) {
    master = Buffer.from(fromEnv, "hex");
  } else {
    const dataDir = path.join(process.cwd(), "data");
    const keyPath = path.join(dataDir, "messages.key");
    try {
      if (fs.existsSync(keyPath)) {
        const k = Buffer.from(fs.readFileSync(keyPath, "utf-8").trim(), "hex");
        if (k.length === 32) master = k;
      }
    } catch {
      /* создадим ниже */
    }
    if (!master) {
      // Файл есть, но прочитать ключ не вышло — молча сделать новый значило бы
      // навсегда потерять доступ ко всей уже зашифрованной переписке. Лучше
      // не запуститься.
      if (fs.existsSync(keyPath)) {
        throw new Error("data/messages.key повреждён — без него переписку не расшифровать; восстановите файл из резервной копии");
      }
      master = crypto.randomBytes(32);
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(keyPath, master.toString("hex"), { mode: 0o600 });
      console.log("[messages] создан ключ шифрования data/messages.key — вынесите его в MESSAGES_KEY и сохраните отдельно от базы");
    }
  }
  // Два независимых подключа из одного: ключ шифрования и ключ отпечатков для
  // поиска не должны совпадать.
  const derive = (info) => Buffer.from(crypto.hkdfSync("sha256", master, Buffer.alloc(0), info, 32));
  // enc — ключ формата enc1 (только для чтения старых строк), index — ключ
  // отпечатков для поиска, kek — мастер, которым завёрнуты ключи данных.
  //
  // Ключ отпечатков не ротируется намеренно: отпечаток слова в указателе и
  // отпечаток слова в запросе должны совпадать, а смена ключа означала бы
  // перестройку указателя по всей переписке.
  keys = {
    enc: derive("shalter/messages/enc"),
    index: derive("shalter/messages/index"),
    kek: derive("shalter/messages/kek"),
  };
  return keys;
}

function isEncrypted(stored) {
  return typeof stored === "string" && (stored.startsWith(PREFIX) || stored.startsWith(PREFIX_V1));
}

function gcmOpen(key, id, raw) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_LEN));
  decipher.setAAD(Buffer.from(String(id)));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_LEN));
  return Buffer.concat([decipher.update(raw.subarray(IV_LEN, raw.length - TAG_LEN)), decipher.final()]).toString("utf8");
}

// Пустой текст (фото без подписи, стикер, подарок) не шифруется: скрывать там
// нечего, а «пусто» у сообщения без текста и так видно по остальным столбцам.
function encryptText(id, text) {
  const plain = String(text ?? "");
  if (!plain) return "";
  const { id: keyId, key } = keyring.currentKey("messages", loadKeys().kek);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(String(id)));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${keyId}:${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64")}`;
}

// Незашифрованное отдаётся как есть — строки из старой базы, ещё не прошедшие
// миграцию (db.js), читаются так же, как и раньше.
function decryptText(id, stored) {
  if (!isEncrypted(stored)) return stored ?? "";
  try {
    if (stored.startsWith(PREFIX_V1)) {
      return gcmOpen(loadKeys().enc, id, Buffer.from(stored.slice(PREFIX_V1.length), "base64"));
    }
    const rest = stored.slice(PREFIX.length);
    const colon = rest.indexOf(":");
    const keyId = Number(rest.slice(0, colon));
    if (colon < 1 || !Number.isInteger(keyId)) throw new Error("bad key id");
    const key = keyring.getKey("messages", keyId, loadKeys().kek);
    return gcmOpen(key, id, Buffer.from(rest.slice(colon + 1), "base64"));
  } catch {
    // Не тот ключ или подменённая строка. Показать шифротекст как текст
    // сообщения было бы хуже, чем честно сказать, что прочитать его нельзя.
    console.error(`[messages] не удалось расшифровать сообщение ${id}`);
    return "⚠️ Сообщение не удалось расшифровать";
  }
}

// Те же правила разбиения на слова, что были у FTS5 (unicode61 с
// remove_diacritics): регистр не важен, диакритика снимается, словом
// считается непрерывный ряд букв и цифр.
function words(text) {
  return (
    String(text ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function token(kind, value) {
  // 16 hex-символов = 64 бита: совпадения случайных отпечатков на масштабе
  // одного сервера практически исключены, а указатель остаётся компактным.
  return crypto.createHmac("sha256", loadKeys().index).update(`${kind}:${value}`).digest("hex").slice(0, 16);
}

// Что кладётся в поисковый указатель для текста: отпечаток каждого слова
// целиком (w:) и каждого его начала (p:). Повторы убираются — detail=none всё
// равно не хранит, сколько раз слово встретилось.
function searchTokens(text) {
  const out = new Set();
  for (const w of new Set(words(text))) {
    out.add(token("w", w));
    const chars = [...w];
    for (let i = 1; i <= Math.min(chars.length, MAX_PREFIX); i++) out.add(token("p", chars.slice(0, i).join("")));
  }
  return [...out].join(" ");
}

// Строка для MATCH: все слова, кроме последнего, — целиком, последнее — как
// начало слова (человек в строке поиска ещё печатает). null — искать нечего.
function searchQuery(query) {
  const list = words(query);
  if (!list.length) return null;
  return list
    .map((w, i) => (i === list.length - 1 ? token("p", [...w].slice(0, MAX_PREFIX).join("")) : token("w", w)))
    .join(" AND ");
}

// Есть ли в тексте ссылка — нужно вкладке «Ссылки» в профиле. Раньше это
// спрашивали у базы через text LIKE '%http%', но по шифротексту так не
// спросишь, поэтому признак считается при записи и лежит в своём столбце.
function hasLink(text) {
  return /http/i.test(String(text ?? "")) ? 1 : 0;
}

module.exports = { encryptText, decryptText, isEncrypted, searchTokens, searchQuery, hasLink, loadKeys };
