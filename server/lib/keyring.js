const crypto = require("crypto");

// Ротация ключей шифрования — схема «конверта», как в облачных KMS.
//
// Два уровня ключей:
// - мастер-ключ (MESSAGES_KEY / UPLOADS_KEY или data/*.key) ничего не шифрует
//   сам — им только «заворачиваются» ключи данных;
// - ключи данных шифруют сами сообщения (lib/textCrypto.js) и файлы
//   (lib/fileCrypto.js). Каждый живёт не дольше KEY_ROTATION_SECONDS (по
//   умолчанию 120 секунд, т.е. новый ключ каждые 2 минуты), потом для новых
//   записей создаётся следующий.
//
// Старые ключи не удаляются: ими зашифрована вся переписка до этого момента,
// и без них она не прочитается. Они лежат в таблице crypto_keys завёрнутыми
// мастер-ключом, в открытом виде — только в памяти процесса. Каждая запись
// помнит номер своего ключа, поэтому перешифровывать старое не нужно.
//
// Что это даёт: один ключ данных закрывает не больше двух минут переписки.
// Утёкший из памяти или из дампа ключ открывает только этот отрезок, а не всё
// сразу. Чего не даёт: защиты от утечки мастер-ключа — им разворачиваются все
// ключи данных. Мастер-ключ меняет администратор (DEPLOY.md).
//
// Ключ создаётся лениво, при первой записи после истечения предыдущего, а не
// по таймеру: на простаивающем сервере не копятся сотни ключей в сутки, при
// этом ни одна запись не шифруется ключом старше двух минут.
const ROTATE_MS = Math.max(10, Number(process.env.KEY_ROTATION_SECONDS) || 120) * 1000;

let db = null;
// Развёрнутые ключи: `${purpose}:${id}` → Buffer. По 32 байта, даже год
// ротации каждые 2 минуты — это единицы мегабайт.
const cache = new Map();
// Действующий ключ для новых записей по назначению: purpose → { id, key, createdMs }.
const current = new Map();

// Вызывается из server/db.js, пока база открывается: db.js сам пользуется
// шифрованием при миграции, поэтому require("../db") отсюда дал бы цикл.
function init(database) {
  db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS crypto_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purpose TEXT NOT NULL,
      wrapped TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crypto_keys_purpose ON crypto_keys(purpose, id);
  `);
}

function database() {
  if (!db) init(require("../db"));
  return db;
}

// В AAD — назначение и номер ключа: завёрнутый ключ нельзя переставить в
// другую строку или выдать за ключ другого назначения.
function wrap(kek, purpose, id, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(Buffer.from(`${purpose}:${id}`));
  const body = Buffer.concat([cipher.update(key), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

function unwrap(kek, purpose, id, wrapped) {
  const raw = Buffer.from(wrapped, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", kek, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${purpose}:${id}`));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]);
}

// Ключ для новой записи. После перезапуска подхватывает последний ключ из
// базы, если тот ещё не истёк, — иначе каждый перезапуск плодил бы ключ.
function currentKey(purpose, kek) {
  const now = Date.now();
  const cur = current.get(purpose);
  if (cur && now - cur.createdMs < ROTATE_MS) return cur;

  const d = database();
  if (!cur) {
    const row = d.prepare("SELECT * FROM crypto_keys WHERE purpose = ? ORDER BY id DESC LIMIT 1").get(purpose);
    const createdMs = row ? Date.parse(row.createdAt) : 0;
    if (row && now - createdMs < ROTATE_MS) {
      const fresh = { id: row.id, key: unwrap(kek, purpose, row.id, row.wrapped), createdMs };
      cache.set(`${purpose}:${row.id}`, fresh.key);
      current.set(purpose, fresh);
      return fresh;
    }
  }

  const key = crypto.randomBytes(32);
  const createdAt = new Date(now).toISOString();
  // Номер ключа входит в AAD обёртки, а известен только после вставки —
  // поэтому вставка и обёртка в одной транзакции.
  const id = d.transaction(() => {
    const newId = Number(d.prepare("INSERT INTO crypto_keys (purpose, wrapped, createdAt) VALUES (?, '', ?)").run(purpose, createdAt).lastInsertRowid);
    d.prepare("UPDATE crypto_keys SET wrapped = ? WHERE id = ?").run(wrap(kek, purpose, newId, key), newId);
    return newId;
  })();
  const fresh = { id, key, createdMs: now };
  cache.set(`${purpose}:${id}`, key);
  current.set(purpose, fresh);
  return fresh;
}

// Ключ, которым была сделана запись. Нет ключа — запись не прочитать; это
// ошибка, а не повод молча вернуть что-то другое.
function getKey(purpose, id, kek) {
  const cacheKey = `${purpose}:${id}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const row = database().prepare("SELECT * FROM crypto_keys WHERE id = ? AND purpose = ?").get(id, purpose);
  if (!row) throw new Error(`нет ключа ${cacheKey}`);
  const key = unwrap(kek, purpose, row.id, row.wrapped);
  cache.set(cacheKey, key);
  return key;
}

module.exports = { init, currentKey, getKey, ROTATE_MS };
