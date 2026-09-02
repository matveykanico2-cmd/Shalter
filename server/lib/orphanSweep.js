const fs = require("fs");
const path = require("path");
const db = require("../db");

// Уборка файлов, на которые никто не ссылается.
//
// Откуда они берутся: человек выбрал фотографию, она уехала на сервер — и он
// передумал отправлять. Или отправил, а потом сообщение удалили. Файл при этом
// остаётся на диске навсегда: сообщения удаляются, вложения нет.
//
// На большом диске это незаметно, на шестидесяти гигабайтах — нет.
//
// Ссылки ищутся во всех местах, где вообще может лежать путь к файлу:
// вложения и стикеры сообщений, аватары (текущий и вся галерея), фотографии
// объявлений, обложки магазинов и товаров. Пропустить хоть одно значило бы
// удалить нужное, поэтому список собирается запросами по всем таблицам сразу,
// а не «по памяти».
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

// Свежие файлы не трогаем вообще: между загрузкой и отправкой сообщения
// проходит время, и файл, залитый минуту назад, вполне может ждать своей
// отправки прямо сейчас.
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

function collectReferenced() {
  const referenced = new Set();
  const add = (value) => {
    if (typeof value !== "string") return;
    // В одной строке (JSON вложений, галерея аватаров) путей может быть много.
    for (const m of value.matchAll(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g)) {
      referenced.add(m[1]);
    }
  };

  const scan = (sql, columns) => {
    let rows = [];
    try {
      rows = db.prepare(sql).all();
    } catch {
      // Таблицы может не быть на старой базе — это не повод падать всей уборке.
      return;
    }
    for (const row of rows) for (const c of columns) add(row[c]);
  };

  scan("SELECT attachments, sticker, text FROM messages", ["attachments", "sticker", "text"]);
  scan("SELECT avatarImage, avatarImages FROM users", ["avatarImage", "avatarImages"]);
  scan("SELECT avatarImage FROM chats", ["avatarImage"]);
  scan("SELECT photos FROM listings", ["photos"]);
  scan("SELECT imageUrl FROM shops", ["imageUrl"]);
  scan("SELECT imageUrl FROM shop_products", ["imageUrl"]);
  scan("SELECT url, items FROM stories", ["url", "items"]);
  return referenced;
}

// Возвращает, сколько удалено и сколько места освобождено.
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
        // Файл занят или уже удалён — посчитаем в следующий раз.
      }
    }
  }
  return { removed, freedBytes };
}

// Раз в сутки. Не чаще: проход читает все ссылки из базы, и делать это каждый
// час ради нескольких файлов незачем.
function startOrphanSweep() {
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
  // Первый проход не сразу при запуске: сервер только поднялся, ему есть чем
  // заняться.
  setTimeout(run, 5 * 60 * 1000).unref();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

// Файл, который уже все увидели, сервер больше не хранит.
//
// Мысль простая: вложение нужно на сервере ровно до тех пор, пока его не
// забрали. Все участники чата открыли сообщение — файл своё отработал, у них
// он теперь лежит на устройствах (service worker складывает вложения к себе,
// см. public/sw.js). Держать на диске второй экземпляр незачем.
//
// Что при этом теряется, и это надо понимать: тот, кто откроет чат с нового
// устройства, старый файл уже не получит — увидит, что вложение недоступно.
// Поэтому даётся отсрочка: даже прочитанное всеми хранится ещё несколько дней,
// на случай «зашёл с ноутбука посмотреть».
const DELIVERED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function sweepDelivered({ dryRun = false, graceMs = DELIVERED_GRACE_MS } = {}) {
  if (!fs.existsSync(UPLOAD_DIR)) return { removed: 0, freedBytes: 0 };
  const cutoff = new Date(Date.now() - graceMs).toISOString();

  // Сообщения с вложениями, которые старше отсрочки. Участников чата берём тем
  // же запросом: «прочитали все» проверяется по join-таблице, а не перебором
  // чатов в памяти.
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

  // Файл удаляем, только если он не нужен больше нигде: одно и то же вложение
  // после дедупликации могут делить несколько сообщений (пересылки), и одно из
  // них может быть свежим или ещё не прочитанным.
  const stillNeeded = collectReferencedExcept(new Set());
  const candidates = new Map();

  for (const row of rows) {
    let readers = [];
    try {
      readers = JSON.parse(row.readByIds || "[]");
    } catch {
      continue;
    }
    // «Прочитали все» — число прочитавших не меньше числа участников. В личной
    // переписке это двое, в группе — сколько есть.
    if (!row.members || readers.length < row.members) continue;
    for (const m of String(row.attachments).matchAll(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g)) {
      candidates.set(m[1], (candidates.get(m[1]) ?? 0) + 1);
    }
  }

  let removed = 0;
  let freedBytes = 0;
  for (const name of candidates.keys()) {
    // Ссылка из непрочитанного или свежего сообщения — файл ещё нужен.
    if (stillNeeded.has(name)) continue;
    const full = path.join(UPLOAD_DIR, name);
    try {
      const stat = fs.statSync(full);
      freedBytes += stat.size;
      removed += 1;
      if (!dryRun) fs.unlinkSync(full);
    } catch {
      // Уже нет — и хорошо.
    }
  }
  return { removed, freedBytes };
}

// Ссылки из всего, что ещё должно храниться: непрочитанные сообщения, свежие
// сообщения, аватары, объявления, истории. Всё, что сюда попало, не трогаем.
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
      /* таблицы может не быть */
    }
  };
  // Свежие сообщения и те, что прочитали не все.
  scan(
    `SELECT m.attachments FROM messages m
      WHERE m.createdAt >= ?
         OR (SELECT count(*) FROM chat_members cm WHERE cm.chatId = m.chatId) >
            (SELECT count(*) FROM json_each(m.readByIds))`,
    ["attachments"],
    [cutoff]
  );
  scan("SELECT avatarImage, avatarImages FROM users", ["avatarImage", "avatarImages"]);
  scan("SELECT avatarImage FROM chats", ["avatarImage"]);
  scan("SELECT photos FROM listings", ["photos"]);
  scan("SELECT imageUrl FROM shops", ["imageUrl"]);
  scan("SELECT imageUrl FROM shop_products", ["imageUrl"]);
  scan("SELECT url, items FROM stories", ["url", "items"]);
  // Эскизы не удаляются никогда — в этом весь их смысл. Полная картинка
  // уходит с диска, когда её получили все, а эскиз остаётся, и чат не
  // превращается в набор серых квадратов для того, кто зашёл с нового
  // устройства. Весят они килобайты, местом можно пренебречь.
  keepThumbnails(keep);
  return keep;
}

// Отдельным проходом: эскизы лежат в тех же вложениях, но в своём поле, и
// общий разбор строки их не отличает от полной картинки.
function keepThumbnails(keep) {
  try {
    for (const row of db.prepare("SELECT attachments FROM messages WHERE attachments LIKE '%thumbUrl%'").all()) {
      let list = [];
      try {
        list = JSON.parse(row.attachments || "[]");
      } catch {
        continue;
      }
      for (const a of list) {
        const m = String(a?.thumbUrl ?? "").match(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/);
        if (m) keep.add(m[1]);
      }
    }
  } catch {
    /* нет таблицы или колонки — значит и эскизов нет */
  }
}

module.exports = { sweepOrphans, sweepDelivered, startOrphanSweep };
