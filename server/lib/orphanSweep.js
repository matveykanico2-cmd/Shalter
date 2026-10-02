const fs = require("fs");
const path = require("path");
const db = require("../db");
const { decryptText } = require("./textCrypto");

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

const MIN_AGE_MS = 24 * 60 * 60 * 1000;

// Ссылки на загрузки живут в десятках колонок (стикер-паки, музыка профиля,
// медиа подарков и автоответов, обои, статусы, отложенные сообщения…), и
// ручной список таблиц всегда отстаёт от новых фич — а пропущенная колонка
// значит, что живой файл сотрут через сутки. Поэтому обходим все текстовые
// колонки всех таблиц. messages.text зашифрован — его разбирают отдельно.
const SKIP_TABLES = new Set(["upload_access", "sqlite_sequence"]);

function scanAllTables(add, { skipTables = [] } = {}) {
  const skip = new Set([...SKIP_TABLES, ...skipTables]);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const table of tables) {
    if (skip.has(table) || table.startsWith("sqlite_")) continue;
    let columns = [];
    try {
      columns = db.prepare(`PRAGMA table_info("${table}")`).all();
    } catch {
      continue;
    }
    for (const { name, type } of columns) {
      if (!/TEXT|^$/i.test(type ?? "")) continue;
      if (table === "messages" && name === "text") continue;
      try {
        for (const row of db.prepare(`SELECT "${name}" AS v FROM "${table}" WHERE instr("${name}", '/uploads/') > 0`).iterate()) add(row.v);
      } catch {
      }
    }
  }
}

function collectReferenced() {
  const referenced = new Set();
  const add = (value) => {
    if (typeof value !== "string") return;
    for (const m of value.matchAll(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g)) {
      referenced.add(m[1]);
    }
  };

  try {
    for (const row of db.prepare("SELECT id, text FROM messages WHERE text <> ''").iterate()) add(decryptText(row.id, row.text));
  } catch {
  }
  scanAllTables(add);
  return referenced;
}

function sweepOrphans({ dryRun = false } = {}) {
  if (!fs.existsSync(UPLOAD_DIR)) return { removed: 0, freedBytes: 0 };
  const referenced = collectReferenced();
  const now = Date.now();
  let removed = 0;
  let freedBytes = 0;

  for (const name of fs.readdirSync(UPLOAD_DIR)) {
    if (referenced.has(name)) continue;
    const full = path.join(UPLOAD_DIR, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile() || now - stat.mtimeMs < MIN_AGE_MS) continue;
    freedBytes += stat.size;
    removed += 1;
    if (!dryRun) {
      try {
        fs.unlinkSync(full);
      } catch {
      }
    }
  }
  return { removed, freedBytes };
}

function startOrphanSweep() {
  if (require("./storage").isS3Enabled) {
    console.log("[uploads] хранилище — S3, автоматическая уборка файлов пока работает только для локального диска");
    return;
  }
  const run = () => {
    try {
      const { removed, freedBytes } = sweepOrphans();
      if (removed) console.log(`[uploads] убрано файлов без ссылок: ${removed}, освобождено ${(freedBytes / 1024 / 1024).toFixed(1)} МБ`);
      const delivered = sweepDelivered();
      if (delivered.removed)
        console.log(`[uploads] отдано и забыто: ${delivered.removed} файлов, освобождено ${(delivered.freedBytes / 1024 / 1024).toFixed(1)} МБ`);
    } catch (err) {
      console.error("[uploads] уборка не удалась:", err.message);
    }
  };
  setTimeout(run, 5 * 60 * 1000).unref();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

const DELIVERED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function sweepDelivered({ dryRun = false, graceMs = DELIVERED_GRACE_MS } = {}) {
  if (!fs.existsSync(UPLOAD_DIR)) return { removed: 0, freedBytes: 0 };
  const cutoff = new Date(Date.now() - graceMs).toISOString();

  let rows = [];
  try {
    rows = db
      .prepare(
        `SELECT m.id, m.chatId, m.attachments, m.readByIds,
                (SELECT count(*) FROM chat_members cm WHERE cm.chatId = m.chatId) AS members
           FROM messages m
          WHERE m.createdAt < ? AND m.attachments IS NOT NULL AND m.attachments <> '[]'`
      )
      .all(cutoff);
  } catch {
    return { removed: 0, freedBytes: 0 };
  }

  const stillNeeded = collectReferencedExcept(new Set());
  const candidates = new Map();

  for (const row of rows) {
    let readers = [];
    try {
      readers = JSON.parse(row.readByIds || "[]");
    } catch {
      continue;
    }
    if (!row.members || readers.length < row.members) continue;
    for (const m of String(row.attachments).matchAll(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g)) {
      candidates.set(m[1], (candidates.get(m[1]) ?? 0) + 1);
    }
  }

  let removed = 0;
  let freedBytes = 0;
  for (const name of candidates.keys()) {
    if (stillNeeded.has(name)) continue;
    const full = path.join(UPLOAD_DIR, name);
    try {
      const stat = fs.statSync(full);
      freedBytes += stat.size;
      removed += 1;
      if (!dryRun) fs.unlinkSync(full);
    } catch {
    }
  }
  return { removed, freedBytes };
}

function collectReferencedExcept() {
  const keep = new Set();
  const add = (value) => {
    if (typeof value !== "string") return;
    for (const m of value.matchAll(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g)) keep.add(m[1]);
  };
  const cutoff = new Date(Date.now() - DELIVERED_GRACE_MS).toISOString();
  const scan = (sql, columns, params = []) => {
    try {
      for (const row of db.prepare(sql).all(...params)) for (const c of columns) add(row[c]);
    } catch {
    }
  };
  scan(
    `SELECT m.attachments FROM messages m
      WHERE m.createdAt >= ?
         OR (SELECT count(*) FROM chat_members cm WHERE cm.chatId = m.chatId) >
            (SELECT count(*) FROM json_each(m.readByIds))`,
    ["attachments"],
    [cutoff]
  );
  scan("SELECT sticker FROM messages WHERE sticker IS NOT NULL", ["sticker"]);
  // Всё, кроме сообщений: аватары, стикер-паки, подарки, отложенные и т. д.
  scanAllTables(add, { skipTables: ["messages"] });
  keepThumbnails(keep);
  return keep;
}

function keepThumbnails(keep) {
  try {
    for (const row of db
      .prepare("SELECT attachments FROM messages WHERE attachments LIKE '%thumbUrl%' OR attachments LIKE '%previewUrl%'")
      .all()) {
      let list = [];
      try {
        list = JSON.parse(row.attachments || "[]");
      } catch {
        continue;
      }
      for (const a of list) {
        for (const value of [a?.thumbUrl, a?.previewUrl, a?.posterUrl]) {
          const m = String(value ?? "").match(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/);
          if (m) keep.add(m[1]);
        }
      }
    }
  } catch {
  }
}

module.exports = { sweepOrphans, sweepDelivered, startOrphanSweep };
