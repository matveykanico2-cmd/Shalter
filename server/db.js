// Real SQLite persistence (via better-sqlite3 — synchronous, no separate DB
// server/process to run or configure, which keeps this app's "single process,
// self-hosted" deployment story from DEPLOY.md intact) replacing the old
// flat-JSON-file-per-collection store (server/data/store.js, now retired).
//
// Schema notes:
// - Booleans are stored as INTEGER 0/1 (SQLite has no native boolean type).
// - Data that's genuinely queried from both directions is normalized into
//   real join tables with indexes: chat_members (list a chat's members *and*
//   list a user's chats) and call_participants (same shape, for calls).
// - Everything else nested (message reactions/readByIds/deletedForIds/
//   attachments/keyboard, a chat's folder contents, a story's viewer list, a
//   user's blocked-user list, a bot's command list, a push subscription's
//   keys, the whole per-user settings object) is only ever read or written
//   through its single parent row — nothing queries "all messages user X has
//   reacted to" across rows — so it stays a JSON TEXT column on that row,
//   same shape as the old JSON-file records. Normalizing it further would
//   multiply this rewrite's size without any real query benefit.
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(process.cwd(), "data", "app.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Настройки под небольшую машину: два ядра, два гигабайта памяти.
//
// По умолчанию SQLite бережлив до вредного — кэш страниц в 2 МБ означает, что
// один и тот же индекс перечитывается с диска снова и снова.
//
// - cache_size = -32000 — 32 МБ на кэш страниц (минус означает килобайты, а не
//   число страниц). Это единственная память, которую база берёт постоянно;
//   32 МБ на двухгигабайтной машине не жалко, а попаданий в кэш прибавляет
//   заметно.
// - synchronous = NORMAL — при включённом WAL это рекомендованный режим:
//   fsync не на каждую запись, а на контрольную точку. Потеря питания может
//   стоить последних записей, но не целостности базы. FULL здесь означал бы
//   fsync на каждое сообщение — на обычном диске это десятки миллисекунд.
// - busy_timeout — вместо мгновенного «база занята» подождать до пяти секунд.
//   Пишущий у нас один процесс, но фоновые уборщики (автоудаление, отложенные
//   сообщения) пересекаются с обычными запросами, и отказ вместо ожидания
//   выглядел бы как случайная ошибка на ровном месте.
// - mmap_size — читать файл через отображение в память вместо копирования в
//   буферы: меньше работы на каждое чтение. 256 МБ — это адресное
//   пространство, а не занятая память: страницы подтягиваются по мере нужды и
//   вытесняются системой под давлением.
// - temp_store = MEMORY — временные таблицы сортировок в памяти, а не файлами
//   на диске.
db.pragma("cache_size = -32000");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("mmap_size = 268435456");
db.pragma("temp_store = MEMORY");

// Приведение к нижнему регистру, понимающее кириллицу.
//
// Встроенная в SQLite lower() работает только с латиницей: lower('Велосипед')
// возвращает 'Велосипед' как есть. Из-за этого поиск по русским словам не
// находил ничего — искали по 'велосипед', а в базе сравнивалось с 'Велосипед'.
// Здесь та же операция, но средствами JavaScript, который Unicode знает.
//
// Индексам это не мешает: поиск по доске объявлений идёт через LIKE '%…%',
// а такой запрос индексом не пользуется в любом случае.
db.function("lower_ru", (value) => String(value ?? "").toLowerCase());

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  passwordHash TEXT,
  passwordSalt TEXT,
  avatarColor TEXT,
  avatarImage TEXT,
  bio TEXT NOT NULL DEFAULT '',
  online INTEGER NOT NULL DEFAULT 0,
  lastSeen TEXT,
  isBot INTEGER NOT NULL DEFAULT 0,
  blockedUserIds TEXT NOT NULL DEFAULT '[]',
  isPremium INTEGER NOT NULL DEFAULT 0,
  referralCode TEXT,
  referredBy TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  username TEXT,
  isPublic INTEGER NOT NULL DEFAULT 0,
  avatarColor TEXT,
  avatarImage TEXT,
  ownerId TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  linkedDiscussionChatId TEXT
);

CREATE TABLE IF NOT EXISTS chat_members (
  chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  isAdmin INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chatId, userId)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(userId);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  senderId TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  editedAt TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  replyToId TEXT,
  forwardedFrom TEXT,
  attachments TEXT,
  keyboard TEXT,
  reactions TEXT NOT NULL DEFAULT '[]',
  readByIds TEXT NOT NULL DEFAULT '[]',
  deletedForIds TEXT NOT NULL DEFAULT '[]',
  anchorForPostId TEXT,
  discussionAnchorId TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  commentCount INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chatId, createdAt);

-- localName: what the owner calls this person, as in Telegram's own contact
-- form. Their account name is theirs to change; this is the name the person who
-- added them recognises, and it's what the address-book import already read out
-- of the vCard and had nowhere to put.
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  userId TEXT NOT NULL,
  addedAt TEXT NOT NULL,
  localName TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(ownerId);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  chatIds TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(ownerId);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL,
  kind TEXT NOT NULL,
  direction TEXT,
  callerId TEXT NOT NULL,
  status TEXT NOT NULL,
  startedAt TEXT NOT NULL,
  durationSec INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS call_participants (
  callId TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  PRIMARY KEY (callId, userId)
);
CREATE INDEX IF NOT EXISTS idx_call_participants_user ON call_participants(userId);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  callId TEXT NOT NULL,
  fromUserId TEXT NOT NULL,
  toUserId TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signals_lookup ON signals(callId, toUserId, seq);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  deviceId TEXT NOT NULL,
  device TEXT,
  location TEXT,
  lastActive TEXT NOT NULL,
  UNIQUE (userId, deviceId)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

CREATE TABLE IF NOT EXISTS settings (
  userId TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  ownerId TEXT,
  token TEXT,
  description TEXT,
  commands TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporterId TEXT NOT NULL,
  targetType TEXT NOT NULL,
  targetId TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  viewedByIds TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(userId);

-- A message queued to send later (composer.js's clock icon → time picker,
-- server/lib/scheduledMessagesSweep.js's sweep). Deliberately its own table
-- rather than a sendAt column on messages — a not-yet-sent
-- message shouldn't show up in message lists, count toward unread, or need
-- read-receipt/reaction columns at all, so keeping it out of that table
-- until the sweep fires (turning it into a real row via the normal
-- addMessage()) avoids every existing messages query needing a "not yet
-- due" filter.
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  senderId TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  attachments TEXT,
  replyToId TEXT,
  sendAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_sendAt ON scheduled_messages(sendAt);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_chat ON scheduled_messages(chatId);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(userId);

CREATE TABLE IF NOT EXISTS vapid_keys (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  publicKey TEXT NOT NULL,
  privateKey TEXT NOT NULL
);

-- The DKIM signing key for outgoing mail (server/lib/dkim.js), generated on
-- first use and never regenerated: the matching public half lives in a DNS TXT
-- record, so a new keypair would silently invalidate every letter until DNS is
-- updated too. Same "id=1, upsert in place" shape as vapid_keys above.
-- Граница прочитанного: всё, что старше lastReadAt, в этом чате прочитано.
--
-- Нужна ради скорости, а не ради правды: правда по-прежнему в readByIds на
-- каждом сообщении. Но пересчитывать непрочитанные, просматривая весь чат,
-- дорого — на живом аккаунте это был один из двух самых тяжёлых запросов
-- (12 мс на список чатов). С этой границей достаточно посмотреть на сообщения
-- новее её, а их единицы.
CREATE TABLE IF NOT EXISTS chat_reads (
  chatId TEXT NOT NULL,
  userId TEXT NOT NULL,
  lastReadAt TEXT NOT NULL,
  PRIMARY KEY (chatId, userId)
);

-- Полнотекстовый указатель по сообщениям.
--
-- Поиск через LIKE '%слово%' индексом пользоваться не может по своей природе:
-- база вынуждена прочитать каждую строку. FTS5 хранит отдельный указатель
-- слово → сообщение, и поиск становится обращением к нему, а не перебором.
-- content='messages' означает, что тексты не дублируются: указатель ссылается
-- на исходную таблицу.
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  text,
  content='messages',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- Указатель поддерживается триггерами, а не руками в коде: любая запись мимо
-- addMessage() иначе оставила бы его несогласованным, и поиск молча перестал
-- бы находить часть переписки.
CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF text ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;

-- Кто уже видел пост канала (server/data/postViews.js). Отдельная таблица, а
-- не список на самом сообщении: readByIds для этого не годится — открытие чата
-- помечает всё прочитанным разом, ещё до того, как пост показался на экране,
-- и счётчик просмотров, построенный на нём, не вырос бы никогда. Ключ из пары
-- столбцов и делает всю работу: повторная вставка просто ничего не меняет.
CREATE TABLE IF NOT EXISTS post_views (
  postId TEXT NOT NULL,
  userId TEXT NOT NULL,
  viewedAt TEXT NOT NULL,
  PRIMARY KEY (postId, userId)
);

CREATE TABLE IF NOT EXISTS dkim_keys (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  selector TEXT NOT NULL,
  publicKey TEXT NOT NULL,
  privateKey TEXT NOT NULL
);

-- The admin's DonationAlerts OAuth connection (server/lib/donationAlerts.js)
-- — a single row, same "id=1, upsert in place" shape as vapid_keys above.
-- lastDonationId is the sweep's watermark (highest DonationAlerts donation
-- id already processed), so a restart doesn't re-scan/re-fulfill everything.
CREATE TABLE IF NOT EXISTS donation_alerts_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  accessToken TEXT,
  refreshToken TEXT,
  expiresAt TEXT,
  username TEXT,
  lastDonationId INTEGER NOT NULL DEFAULT 0
);

-- A purchase started via /request (Premium, Реклама, or a Gift) while
-- DonationAlerts is connected: real money hasn't landed yet, so the code
-- below just remembers what was asked for and matches it to a donation
-- later (server/lib/donationAlerts.js's poll sweep), same information
-- premium.js/ads.js/gifts.js used to just drop straight into a chat message
-- for the admin to read and act on by hand.
CREATE TABLE IF NOT EXISTS pending_orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  userId TEXT NOT NULL,
  kind TEXT NOT NULL,
  giftId TEXT,
  recipientId TEXT,
  amountRub INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_orders_code ON pending_orders(code);
CREATE INDEX IF NOT EXISTS idx_pending_orders_user ON pending_orders(userId);

-- One row per issued copy of a *limited* gift (server/data/gifts.js's
-- entries carrying a supply) — the thing that makes those gifts actually
-- exclusive rather than just expensive: only that many copies will ever
-- exist, and each one carries its own serial ("#3 из 10").
--
-- Unlike users.giftsReceived (a JSON column — a user's own gift shelf, only
-- ever read through that one row), this genuinely has to be queried across
-- rows: "how many copies of this gift have been handed out?" is what every
-- remaining/sold-out check asks. Per AGENTS.md that makes it a real table,
-- not more nested JSON.
--
-- UNIQUE(giftId, serial) is the last line of defence against two buyers
-- claiming the same serial: server/data/giftIssues.js already wraps the
-- read-then-insert in a transaction, but the constraint means even a bug
-- there can only ever fail loudly, never silently mint a duplicate #1.
CREATE TABLE IF NOT EXISTS gift_issues (
  id TEXT PRIMARY KEY,
  giftId TEXT NOT NULL,
  serial INTEGER NOT NULL,
  recipientId TEXT NOT NULL,
  fromId TEXT,
  issuedAt TEXT NOT NULL,
  UNIQUE (giftId, serial)
);
CREATE INDEX IF NOT EXISTS idx_gift_issues_gift ON gift_issues(giftId);
CREATE INDEX IF NOT EXISTS idx_gift_issues_recipient ON gift_issues(recipientId);

-- Audit log of lawful-request data exports (server/routes/admin.js's
-- /export). The whole point of this feature is that it's transparent and
-- accountable, not a silent backdoor: every time an admin exports a user's
-- stored correspondence in response to a legal request, one row lands here
-- recording who ran it, whose data, on what stated legal basis, when, and
-- how many messages came out. This log is append-only in practice (no route
-- deletes from it) so it can itself be shown to a regulator as proof the
-- process is controlled.
--
-- Deliberately records only *metadata about the export action* — never the
-- exported content itself (that would just be a second copy of private data
-- sitting around). And it can't reach end-to-end secret-chat plaintext at
-- all: the server has no keys, so those messages are exported as the
-- ciphertext they're stored as, marked unreadable (see dataExport.js).
-- Sticker packs people build themselves (server/data/stickerPacks.js). The
-- built-in set ships in the client and isn't here. Stickers are a JSON column
-- because a pack is only ever read and written whole.
CREATE TABLE IF NOT EXISTS sticker_packs (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  stickers TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sticker_packs_owner ON sticker_packs(ownerId);

-- Admin-editable layer over the shipped gift catalogue (server/data/gifts.js).
-- Two kinds of row live here, told apart by the custom flag:
--   custom = 0 — an override for a built-in gift. Only its supply is read; the
--                other columns stay NULL so an override can't rename or reprice
--                something that shipped.
--   custom = 1 — a gift the admin minted, with no counterpart in the code
--                catalogue, so every column is meaningful.
-- Deliberately separate from gift_issues: that table records which serials have
-- been handed out and must never be rewritten when a supply changes.
-- priceStars is the price actually charged (the shop has no rouble prices);
-- priceRub is only still read for the shipped catalogue, whose entries predate
-- stars and are converted at STARS_PER_RUB (see data/gifts.js's starPrice).
CREATE TABLE IF NOT EXISTS gift_catalog (
  id TEXT PRIMARY KEY,
  emoji TEXT,
  name TEXT,
  priceRub INTEGER,
  priceStars INTEGER,
  premiumDays INTEGER,
  supply INTEGER,
  exclusive INTEGER NOT NULL DEFAULT 0,
  custom INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_exports (
  id TEXT PRIMARY KEY,
  adminId TEXT NOT NULL,
  targetUserId TEXT NOT NULL,
  reason TEXT NOT NULL,
  messageCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_data_exports_created ON data_exports(createdAt);
`);

// Ad-hoc migration for columns added after this db.js's CREATE TABLE
// statements were first written — CREATE TABLE IF NOT EXISTS is a no-op on a
// database file that already has the `users` table (from before Premium/
// referrals existed), so those columns need to be bolted on separately here.
// История из нескольких файлов — одна запись со списком кадров, а не по записи
// на снимок: выбрали в галерее пять фотографий — это одна история на пять
// кадров, и удаляется она целиком. Старые записи (одна картинка в kind/url)
// продолжают читаться: items у них пустой, и слой данных подставляет kind/url.
const existingStoryColumns = new Set(db.prepare("PRAGMA table_info(stories)").all().map((c) => c.name));
if (!existingStoryColumns.has("items")) db.exec("ALTER TABLE stories ADD COLUMN items TEXT");

const existingUserColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!existingUserColumns.has("isPremium")) db.exec("ALTER TABLE users ADD COLUMN isPremium INTEGER NOT NULL DEFAULT 0");
if (!existingUserColumns.has("referralCode")) db.exec("ALTER TABLE users ADD COLUMN referralCode TEXT");
if (!existingUserColumns.has("referredBy")) db.exec("ALTER TABLE users ADD COLUMN referredBy TEXT");
// Premium is time-boxed (a duration, like a real subscription) rather than a
// permanent flag — premiumUntil is the actual source of truth; the isPremium
// column above is kept only as a legacy/compat field and is no longer read
// (see rowToUser in server/data/users.js, which computes it from this instead).
if (!existingUserColumns.has("premiumUntil")) db.exec("ALTER TABLE users ADD COLUMN premiumUntil TEXT");
// "Ad cabinet" (Settings → Реклама, server/routes/ads.js) — same time-boxed-
// subscription shape as premiumUntil above (20₽/month, same manual-transfer
// trust model), plus the one promotional text/link it lets them set on their
// public profile while active.
if (!existingUserColumns.has("adsUntil")) db.exec("ALTER TABLE users ADD COLUMN adsUntil TEXT");
if (!existingUserColumns.has("adText")) db.exec("ALTER TABLE users ADD COLUMN adText TEXT");
if (!existingUserColumns.has("adUrl")) db.exec("ALTER TABLE users ADD COLUMN adUrl TEXT");
// Optional image/video/file attachments (a small gallery, not just one)
// shown alongside the ad text — same client-authored-JSON shape as a
// message's own attachments array (see server/lib/sanitizeAttachments.js),
// stored as JSON TEXT since it's never queried across rows.
if (!existingUserColumns.has("adAttachments")) db.exec("ALTER TABLE users ADD COLUMN adAttachments TEXT");
// Birthday (Settings → Профиль) — a plain "YYYY-MM-DD" string, same as an
// HTML <input type="date"> gives back. Only the day/month are ever shown
// (see profileDialog.js) — the year is kept anyway since a plain date input
// requires one, not because the app does anything with someone's age.
if (!existingUserColumns.has("birthday")) db.exec("ALTER TABLE users ADD COLUMN birthday TEXT");
// Gift shelf shown on a user's public profile (profileDialog.js) — a JSON
// array appended to whenever the admin actually /deliver's a gift (see
// server/routes/gifts.js), never queried across rows, so it stays a plain
// JSON column rather than its own table (same convention as reactions/
// readByIds on messages — see AGENTS.md).
if (!existingUserColumns.has("giftsReceived")) db.exec("ALTER TABLE users ADD COLUMN giftsReceived TEXT NOT NULL DEFAULT '[]'");
// Set by the admin from the reports moderation chat (server/routes/reports.js's
// /:id/ban) — checked in middleware/auth.js's requireUserId and the login
// routes, same "explicit flag, never inferred" shape as the session-revoked
// check right next to it.
if (!existingUserColumns.has("isBanned")) db.exec("ALTER TABLE users ADD COLUMN isBanned INTEGER NOT NULL DEFAULT 0");
// Why the ban happened, and when — a ban used to be a bare 0/1 flag, which
// meant nobody (least of all the banned person, who just got a dead login
// screen) could tell what it was for, and an admin reviewing it later had
// nothing to review. Shown on the login screen to the banned account and in
// Settings → Модерация to the admin, who can lift it from there.
if (!existingUserColumns.has("banReason")) db.exec("ALTER TABLE users ADD COLUMN banReason TEXT");
if (!existingUserColumns.has("bannedAt")) db.exec("ALTER TABLE users ADD COLUMN bannedAt TEXT");
// Public safety marker on an account, set by the admin (server/routes/
// admin.js's /users/:id/label): "scam", "fake", "terrorism", "extremism" or
// "drugs" — the same idea as Telegram's own SCAM/FAKE badges. Shown to
// *everyone* who opens the profile or sees the chat row, so someone being
// worked by a scammer gets a warning where they'll actually see it, before
// they hand over money — which a silent internal ban queue never does.
if (!existingUserColumns.has("safetyLabel")) db.exec("ALTER TABLE users ADD COLUMN safetyLabel TEXT");
if (!existingUserColumns.has("safetyLabelAt")) db.exec("ALTER TABLE users ADD COLUMN safetyLabelAt TEXT");
// Stars — the in-app currency (server/data/stars.js). Bought with a real
// transfer like everything else here, spent on paid DMs, boosting a message and
// clearing one out of a conversation. An integer count, never money: the ruble
// price lives in the purchase packs, not on the balance.
if (!existingUserColumns.has("stars")) db.exec("ALTER TABLE users ADD COLUMN stars INTEGER NOT NULL DEFAULT 0");
// 0 = anyone may write for free. Above 0, a stranger's first message into this
// account's DM costs them that many stars, which land on this account.
if (!existingUserColumns.has("messagePriceStars")) db.exec("ALTER TABLE users ADD COLUMN messagePriceStars INTEGER NOT NULL DEFAULT 0");

// Two-factor authentication (RFC 6238 TOTP — server/lib/totp.js). The shared
// secret, base32-encoded; a row with totpSecret set but totpEnabledAt null is a
// setup in progress that hasn't been confirmed with a working code yet, and
// counts as "2FA off". Recovery codes are a JSON array of SHA-256 hashes, never
// the codes themselves. All three are stripped from every user object sent to a
// client (see data/sanitize.js).
if (!existingUserColumns.has("totpSecret")) db.exec("ALTER TABLE users ADD COLUMN totpSecret TEXT");
if (!existingUserColumns.has("totpEnabledAt")) db.exec("ALTER TABLE users ADD COLUMN totpEnabledAt TEXT");
if (!existingUserColumns.has("totpRecoveryCodes")) db.exec("ALTER TABLE users ADD COLUMN totpRecoveryCodes TEXT");

// The built-in "Kugo AI" assistant is gone (the whole Claude integration was
// removed — no ANTHROPIC_API_KEY, no bot.ai(), no assistant account). Its user
// row was seeded at startup on older builds, so it's dropped here rather than
// left in everyone's contact list as an account that looks like an assistant
// and never answers. Any DM someone had with it goes too — a one-sided log of
// questions to a bot that no longer exists.
const kugoRow = db.prepare("SELECT id FROM users WHERE id = 'ai_kugo'").get();
if (kugoRow) {
  const kugoChats = db.prepare("SELECT chatId FROM chat_members WHERE userId = 'ai_kugo'").all().map((r) => r.chatId);
  for (const chatId of kugoChats) {
    db.prepare("DELETE FROM messages WHERE chatId = ?").run(chatId);
    db.prepare("DELETE FROM chats WHERE id = ?").run(chatId); // chat_members cascades
  }
  db.prepare("DELETE FROM bots WHERE userId = 'ai_kugo'").run();
  db.prepare("DELETE FROM users WHERE id = 'ai_kugo'").run();
  console.log(`removed the retired Kugo AI assistant account (${kugoChats.length} chat(s))`);
}

// NOTE: an `e2ePublicKey` column may still exist on databases created before
// secret chats were removed. Nothing reads or writes it any more — it's left
// in place rather than dropped, since dropping a column rewrites the whole
// table and there's nothing to gain from it.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone <> ''");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referralCode) WHERE referralCode IS NOT NULL");
// Case-insensitive (COLLATE NOCASE) — usernames are compared case-
// insensitively everywhere else (see findUserByUsername). Wrapped in
// try/catch because, unlike a fresh install, an existing deployment's data
// might already have a legacy duplicate from before this was enforced at
// the app layer (routes/auth.js, routes/users.js) — better to skip the DB-
// level constraint on that one deployment than crash startup entirely.
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE) WHERE username <> ''");
  // Второй индекс по тому же полю — не дубль, а единственный работающий.
  //
  // Приложение ищет людей по @имени через lower(username) (см. data/users.js:
  // регистр в юзернеймах не значим). Индекс выше, с COLLATE NOCASE, для такого
  // запроса не подходит — SQLite показывает SCAN, то есть проход по всем
  // строкам. Переписать запрос на `username IN (…) COLLATE NOCASE` не выход:
  // проверено, план остаётся SCAN, вдобавок с IN такое сравнение находит не всех.
  //
  // Индекс по самому выражению превращает проход в поиск по ключу. Замер на 50
  // тысячах аккаунтов: 100 запросов упоминаний — 482 мс без него и 5 мс с ним.
  // Задействован дважды: при входе по @имени и на каждое упоминание в сообщении.
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(lower(username))");
} catch (err) {
  console.error("Could not create unique username index (likely pre-existing duplicate usernames):", err.message);
}

// Same ad-hoc migration for `bots` — real user-programmable bots (a token +
// owner, see server/routes/botApi.js) were added after this table already
// existed in deployed databases.
// Who the report is actually *about* — stamped at report time (see
// routes/reports.js's responsibleUserId) rather than re-derived later, so
// "show me everything filed against this account" stays one indexed lookup
// even after the reported message or chat has been deleted and there's
// nothing left to resolve an owner from. Null for a reported DM, which has
// no single responsible owner.
const existingReportColumns = new Set(db.prepare("PRAGMA table_info(reports)").all().map((c) => c.name));
if (!existingReportColumns.has("subjectUserId")) db.exec("ALTER TABLE reports ADD COLUMN subjectUserId TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_reports_subject ON reports(subjectUserId)");
db.exec("CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)");

const existingContactCols = new Set(db.prepare("PRAGMA table_info(contacts)").all().map((c) => c.name));
if (!existingContactCols.has("localName")) db.exec("ALTER TABLE contacts ADD COLUMN localName TEXT");

// How the second factor is delivered: "totp" (authenticator app) or "chat" (a
// code the Shalter service bot posts into the account's own service chat, the
// same way login codes already arrive). The chat method exists because an
// authenticator app is a real barrier — it has to be installed, the QR has to be
// scannable, and if neither is true the whole feature is unusable.
const existingTwoFactorCols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!existingTwoFactorCols.has("twoFactorMethod")) db.exec("ALTER TABLE users ADD COLUMN twoFactorMethod TEXT");
// Облачный пароль — третий способ подтвердить вход, рядом с кодом из
// приложения-аутентификатора и кодом в чат Shalter.
//
// Зачем он, когда пароль у аккаунта уже есть: тот пароль — первый шаг, и его
// знает всякий, кто когда-либо входил с чужого устройства или чей пароль утёк
// вместе с почтой. Облачный — второй, отдельный, и спрашивается уже после
// первого. Тем же он отличается от «спрашивать пароль при запуске»
// (settings.requirePasswordOnLaunch): та настройка запирает приложение на уже
// вошедшем устройстве, эта — не пускает внутрь чужого.
//
// Хранится так же, как основной: scrypt с личной солью (server/security.js),
// в открытом виде нигде не лежит и наружу не отдаётся.
//
// Подсказка — необязательная строка, которую видно на экране входа. Она нужна
// ровно для того, чтобы вспомнить свой пароль, и потому не должна быть им
// самим; проверку на это делает маршрут установки.
if (!existingTwoFactorCols.has("cloudPasswordHash")) db.exec("ALTER TABLE users ADD COLUMN cloudPasswordHash TEXT");
if (!existingTwoFactorCols.has("cloudPasswordSalt")) db.exec("ALTER TABLE users ADD COLUMN cloudPasswordSalt TEXT");
if (!existingTwoFactorCols.has("cloudPasswordHint")) db.exec("ALTER TABLE users ADD COLUMN cloudPasswordHint TEXT");

// A handle won at auction. Telegram calls these collectible: the point is that
// it was *acquired*, not merely registered first, and that shows next to the
// name. Stored as the auction it came from, so the claim is checkable rather
// than a flag anyone could have set.
if (!existingTwoFactorCols.has("usernameAuctionId")) db.exec("ALTER TABLE users ADD COLUMN usernameAuctionId TEXT");

// The verified check (the badge next to a name). Set by whoever holds
// ADMIN_PHONE — for accounts, bots, channels and groups alike, since a
// pretend-official channel misleads exactly the same way a pretend-official
// account does.
if (!existingTwoFactorCols.has("isVerified")) db.exec("ALTER TABLE users ADD COLUMN isVerified INTEGER NOT NULL DEFAULT 0");
const existingChatVerifyCols2 = new Set(db.prepare("PRAGMA table_info(chats)").all().map((c) => c.name));
if (!existingChatVerifyCols2.has("isVerified")) db.exec("ALTER TABLE chats ADD COLUMN isVerified INTEGER NOT NULL DEFAULT 0");

// The username auction (server/routes/usernames.js). Short handles are scarce
// and there is no market for them otherwise: whoever registers first keeps @abc
// for ever. The administration puts a free handle up, people bid stars, and the
// winner is charged and given it when it closes.
//
// Bids are stored as a list on the row rather than their own table: nothing ever
// queries "every bid this person made across auctions", and the whole history of
// one auction is read and written together — the same rule the rest of this
// schema follows.
db.exec(`
CREATE TABLE IF NOT EXISTS username_auctions (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  startPriceStars INTEGER NOT NULL DEFAULT 0,
  bids TEXT NOT NULL DEFAULT '[]',
  endsAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  winnerId TEXT,
  soldForStars INTEGER,
  createdAt TEXT NOT NULL,
  settledAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_username_auctions_status ON username_auctions(status);

-- Перепродажа юзернеймов между людьми (server/data/usernameListings.js).
-- Отдельно от аукционов выше, и вот почему: аукцион раздаёт свободный хендл от
-- имени администрации и заканчивается по времени, а здесь один человек продаёт
-- то, чем уже владеет, по назначенной им цене и до тех пор, пока не передумает.
-- Общего у них только предмет торга.
CREATE TABLE IF NOT EXISTS username_listings (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  sellerId TEXT NOT NULL,
  priceStars INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  buyerId TEXT,
  soldAt TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_username_listings_status ON username_listings(status);
`);

// Muting for a while rather than for ever — Telegram offers 1 hour / 8 hours /
// 2 days / forever, and this app only had a permanent on/off switch. `muted`
// stays as the forever flag so nothing that reads it changes.
if (!existingChatVerifyCols2.has("mutedUntil")) db.exec("ALTER TABLE chats ADD COLUMN mutedUntil TEXT");

// Slow mode: the minimum gap between one member's messages, in seconds. Group
// only, staff exempt — the thing you reach for when a group gets loud.
if (!existingChatVerifyCols2.has("slowModeSeconds")) db.exec("ALTER TABLE chats ADD COLUMN slowModeSeconds INTEGER");

// What ordinary members of a group may do. Admins and owners are never bound by
// it — the point of the list is to describe everyone else. Absent (NULL) means
// "everything allowed", which is what every group did before this existed, so no
// existing group changes behaviour on upgrade.
if (!existingChatVerifyCols2.has("permissions")) db.exec("ALTER TABLE chats ADD COLUMN permissions TEXT");

// Join requests. A link can either let people straight in or put them in a
// queue for an admin — Telegram's "Approve new members". Without it an invite
// link is all-or-nothing: the moment it leaks, anyone holding it is inside.
if (!existingChatVerifyCols2.has("approveJoins")) db.exec("ALTER TABLE chats ADD COLUMN approveJoins INTEGER NOT NULL DEFAULT 0");

db.exec(`
CREATE TABLE IF NOT EXISTS join_requests (
  chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (chatId, userId)
);
CREATE INDEX IF NOT EXISTS idx_join_requests_chat ON join_requests(chatId);
`);

const existingMsgSignCols = new Set(db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name));
if (!existingMsgSignCols.has("signedBy")) db.exec("ALTER TABLE messages ADD COLUMN signedBy TEXT");

// Posts signed with their author's name — a channel is written by people, and
// in a busy one "who wrote this" is a real question. Off by default: an
// unsigned channel speaks with one voice, which is the other half of the point.
if (!existingChatVerifyCols2.has("signMessages")) db.exec("ALTER TABLE chats ADD COLUMN signMessages INTEGER NOT NULL DEFAULT 0");

// The invite link — how someone joins a private group or channel. Until now the
// only way in was an admin adding you by hand, which meant a private group had
// no way to grow at all. One active code per chat, regenerable: revoking is the
// point (a leaked link has to be killable), and several simultaneous links are
// bookkeeping nobody here asked for.
if (!existingChatVerifyCols2.has("inviteCode")) db.exec("ALTER TABLE chats ADD COLUMN inviteCode TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_invite ON chats(inviteCode) WHERE inviteCode IS NOT NULL");


// Several profile photos instead of one, and video avatars (lib/avatars.js).
// The older `avatarImage` column stays and keeps its meaning — the current
// avatar's still — so every existing reader of it is untouched.
if (!existingUserColumns.has("avatarImages")) db.exec("ALTER TABLE users ADD COLUMN avatarImages TEXT NOT NULL DEFAULT '[]'");

// Gifts an admin mints are priced in stars now — the currency they're bought
// with. Rows written before this column existed keep their rouble price and are
// converted on read, so an already-issued gift doesn't silently change price.
const existingGiftCatalogCols = new Set(db.prepare("PRAGMA table_info(gift_catalog)").all().map((c) => c.name));
if (!existingGiftCatalogCols.has("priceStars")) db.exec("ALTER TABLE gift_catalog ADD COLUMN priceStars INTEGER");

// A message boosted with stars stays highlighted and pinned to the top of the
// chat until this moment passes (server/routes/stars.js).
const existingMessageCols = new Set(db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name));
if (!existingMessageCols.has("boostedUntil")) db.exec("ALTER TABLE messages ADD COLUMN boostedUntil TEXT");
if (!existingMessageCols.has("boostedById")) db.exec("ALTER TABLE messages ADD COLUMN boostedById TEXT");

// A role between member and admin: a moderator can mute and remove people, but
// cannot change the chat itself or hand out roles (server/routes/chats.js).
// Same per-membership shape as isAdmin rather than a JSON list on the chat.
const existingMemberCols = new Set(db.prepare("PRAGMA table_info(chat_members)").all().map((c) => c.name));
if (!existingMemberCols.has("isModerator")) db.exec("ALTER TABLE chat_members ADD COLUMN isModerator INTEGER NOT NULL DEFAULT 0");
// A group can have more than one owner. chats.ownerId stays as the creator (it's
// what every existing check and every chat created before this read), and this
// flag is what actually grants owner rights — the creator is always set here too,
// so "is an owner" is one lookup rather than "the column or the flag".
if (!existingMemberCols.has("isOwner")) {
  db.exec("ALTER TABLE chat_members ADD COLUMN isOwner INTEGER NOT NULL DEFAULT 0");
  // Backfill: every existing chat's creator becomes its first flagged owner.
  db.exec("UPDATE chat_members SET isOwner = 1 WHERE userId = (SELECT ownerId FROM chats WHERE chats.id = chat_members.chatId)");
}
// Per-member label shown to everyone instead of the default role word — "владелец",
// "модератор", or anything the owner types ("пользователь", "дизайнер", …). A JSON
// map of userId -> title on the chat, never queried across rows.
const existingChatCols2 = new Set(db.prepare("PRAGMA table_info(chats)").all().map((c) => c.name));
if (!existingChatCols2.has("memberTitles")) db.exec("ALTER TABLE chats ADD COLUMN memberTitles TEXT");

const existingBotColumns = new Set(db.prepare("PRAGMA table_info(bots)").all().map((c) => c.name));
if (!existingBotColumns.has("ownerId")) db.exec("ALTER TABLE bots ADD COLUMN ownerId TEXT");
if (!existingBotColumns.has("token")) db.exec("ALTER TABLE bots ADD COLUMN token TEXT");
if (!existingBotColumns.has("createdAt")) db.exec("ALTER TABLE bots ADD COLUMN createdAt TEXT");
// In-app programmable bots (server/lib/botSandbox.js) — a `handleMessage`
// function the owner writes in the built-in editor, run server-side in a
// restricted vm sandbox on every incoming message, as an alternative to
// running an external script against the Bot API.
if (!existingBotColumns.has("code")) db.exec("ALTER TABLE bots ADD COLUMN code TEXT");
// Мини-приложение бота (server/lib/miniApp.js) — обычная веб-страница на
// сервере автора, которая открывается прямо внутри Shalter во встроенном окне
// и знает, кто её открыл. appUrl — адрес страницы, appName — надпись на
// кнопке, которая её открывает.
if (!existingBotColumns.has("appUrl")) db.exec("ALTER TABLE bots ADD COLUMN appUrl TEXT");
if (!existingBotColumns.has("appName")) db.exec("ALTER TABLE bots ADD COLUMN appName TEXT");
// Приложение, у которого нет своего сервера: HTML страницы лежит здесь, а
// раздаёт его сам Shalter (server/routes/miniAppHost.js). Написать бота с
// интерфейсом становится можно, не имея вообще ничего, кроме токена.
if (!existingBotColumns.has("appCode")) db.exec("ALTER TABLE bots ADD COLUMN appCode TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_token ON bots(token) WHERE token IS NOT NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(ownerId)");

// A delivered gift (server/routes/gifts.js's /deliver) used to be posted as
// a plain text message with the emoji inlined — this column lets it carry
// its real data (emoji/name/price/premiumDays) so the client can render an
// actual animated gift card (see messageBubble.js) instead of plain text.
const existingMessageColumns = new Set(db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name));
if (!existingMessageColumns.has("gift")) db.exec("ALTER TABLE messages ADD COLUMN gift TEXT");
// A sent sticker (public/js/lib/stickers.js's catalog + composer.js's picker)
// — same shape as gift above: { emoji, name, anim } so the client can render
// a big, uniquely-animated sticker instead of plain text.
if (!existingMessageColumns.has("sticker")) db.exec("ALTER TABLE messages ADD COLUMN sticker TEXT");
// A fetched link preview (server/lib/linkPreview.js) — { url, title,
// description, image, siteName }. Populated asynchronously after the
// message is already sent (see routes/messages.js), never blocking send on
// a slow/unreachable external site.
if (!existingMessageColumns.has("linkPreview")) db.exec("ALTER TABLE messages ADD COLUMN linkPreview TEXT");
// A new-report notification (server/routes/reports.js) delivered to the
// admin's chat with the "Shalter" service bot — same shape as gift/sticker
// above ({ reportId, reason, reporterName, targetType, targetSummary,
// status }), except status *does* change after send (open -> resolved_
// deleted/resolved_banned/dismissed once the admin acts on it from
// messageBubble.js's ReportMessage), which is why it also needs to be in
// mutate()'s UPDATE below, unlike the immutable gift/sticker payloads.
if (!existingMessageColumns.has("report")) db.exec("ALTER TABLE messages ADD COLUMN report TEXT");
// NOTE: a `payment` column may exist on databases that briefly ran the Т-Банк
// payment-card build. Nothing reads or writes it any more — paying is a plain
// transfer now, and the admin grants the purchase from the buyer's profile
// (see public/js/components/adminUserPanel.js). Left in place rather than
// dropped, same as `e2ePublicKey` on users above.
// @username tokens in the message text resolved (at send time, against the
// chat's member list) to real user ids — server/routes/messages.js computes
// this once on send rather than every reader re-parsing the text client-side.
// Drives the push-notification wording and the chat list's unread-mention
// "@" badge (chat-summary.js), same immutable-at-send-time shape as
// gift/sticker above.
if (!existingMessageColumns.has("mentionedUserIds")) db.exec("ALTER TABLE messages ADD COLUMN mentionedUserIds TEXT NOT NULL DEFAULT '[]'");
// Real threads (Slack-style, not just flat reply-to) — a message with
// threadRootId set is a reply *inside* a thread, one level deep, always
// pointing at the same root. Deliberately separate from the existing
// replyToId (a plain inline quote-reply, shown right in the main
// timeline): a thread reply is instead hidden from the main list entirely
// (see chatView.js's render filter) and only shows in the dedicated thread
// panel (threadPanel.js), which is what actually keeps a busy group's main
// timeline readable — the whole reason Slack/Telegram Topics threads exist
// instead of just flat replies. The root message's own commentCount column
// (already used for channel-post comments) doubles as "reply count" here
// too — same concept (how many replies point at this message), never
// queried in a way that needs to tell the two apart.
if (!existingMessageColumns.has("threadRootId")) db.exec("ALTER TABLE messages ADD COLUMN threadRootId TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_messages_threadRoot ON messages(threadRootId)");

// Per-chat "restrict this member from posting" — { [userId]: isoTimestamp |
// "forever" } (see server/routes/chats.js's /:id/restrict and the send-path
// check in routes/messages.js). Same nested-JSON-on-parent-row pattern as
// everything else here — restrictions are only ever read/written keyed by
// this one chat, never queried across rows.
const existingChatColumns = new Set(db.prepare("PRAGMA table_info(chats)").all().map((c) => c.name));
if (!existingChatColumns.has("restrictions")) db.exec("ALTER TABLE chats ADD COLUMN restrictions TEXT");
// Group "points" (server/routes/chats.js's /:id/vote) — Premium members can
// vote once/day to level the group up; level unlocks are purely cosmetic
// (a badge next to the group name) rather than mechanical feature gates,
// since there's no other real "capability" in this app worth rationing.
if (!existingChatColumns.has("points")) db.exec("ALTER TABLE chats ADD COLUMN points INTEGER NOT NULL DEFAULT 0");
// { [userId]: isoTimestamp of their last vote } — caps voting at once/24h
// per Premium member per group (see /:id/vote), without needing a separate
// votes table for what's really just per-chat rate-limiting state.
if (!existingChatColumns.has("votes")) db.exec("ALTER TABLE chats ADD COLUMN votes TEXT");
// Per-chat "auto-delete messages after N seconds" (server/lib/autoDelete.js's
// sweep, infoPanel.js's duration picker) — null/0 means off. A chat-level
// property (like Telegram's own auto-delete timer), not a per-user setting,
// since it needs to mean the same thing to everyone in the chat.
if (!existingChatColumns.has("autoDeleteSeconds")) db.exec("ALTER TABLE chats ADD COLUMN autoDeleteSeconds INTEGER");

const existingCallColumns = new Set(db.prepare("PRAGMA table_info(calls)").all().map((c) => c.name));
// Premium's "invite by link" (server/routes/calls.js's /:id/invite-link and
// /join/:token) — a random token that lets whoever has the link join this
// call's mesh without needing to already be a member of the underlying chat.
// Null until generated; unique once set so a token only ever resolves to one
// call.
if (!existingCallColumns.has("joinToken")) db.exec("ALTER TABLE calls ADD COLUMN joinToken TEXT");
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_join_token ON calls(joinToken) WHERE joinToken IS NOT NULL");
} catch (err) {
  console.error("Could not create unique call join-token index:", err.message);
}

const existingSessionColumns = new Set(db.prepare("PRAGMA table_info(sessions)").all().map((c) => c.name));
// "Terminate session" (Settings → Устройства, server/routes/sessions.js's
// DELETE /:deviceId) — see server/middleware/auth.js's requireUserId for why
// this is a separate explicit flag rather than just deleting the row: a row
// that's merely *missing* (never recorded yet, or lost to some unrelated bug)
// must never be treated as revoked, or a device can get silently, confusingly
// logged out for no real reason (that's exactly what the old, removed version
// of this feature did). Only an explicit terminate sets this.
if (!existingSessionColumns.has("revokedAt")) db.exec("ALTER TABLE sessions ADD COLUMN revokedAt TEXT");

// База, созданная до появления указателя, приходит с пустым messages_fts —
// поиск в ней не нашёл бы ничего. Заполняем один раз, при первом запуске после
// обновления; на пустой и на уже заполненной это ничего не стоит.
try {
  const indexed = db.prepare("SELECT COUNT(*) AS n FROM messages_fts").get().n;
  const total = db.prepare("SELECT COUNT(*) AS n FROM messages").get().n;
  if (total > 0 && indexed === 0) {
    db.exec("INSERT INTO messages_fts(rowid, text) SELECT rowid, text FROM messages");
    console.log(`[db] построен указатель поиска по ${total} сообщениям`);
  }
} catch (err) {
  console.error("[db] не удалось построить указатель поиска:", err.message);
}

// ── Эфиры в каналах (server/routes/live.js) ─────────────────────────────────
//
// Отдельные таблицы, а не kind='live' в calls, намеренно: звонок звонит.
// Вся ветка входящего вызова (client incomingCallWatcher, рингтон, «принять/
// отклонить») срабатывает на появление записи в calls — и эфир в канале на
// тысячу подписчиков зазвонил бы у тысячи человек. Эфир не звонит: он идёт, о
// нём сообщают плашкой в чате, зайти можно когда угодно.
//
// role: host | speaker | viewer. Разрешение говорить — это смена роли, а не
// отдельный флаг: «может говорить» и «сейчас публикует звук» должны быть одним
// и тем же, иначе они разъезжаются.
db.exec(`
CREATE TABLE IF NOT EXISTS live_streams (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  hostId TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  withVideo INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'live',
  startedAt TEXT NOT NULL,
  endedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_live_streams_chat ON live_streams(chatId, status);

CREATE TABLE IF NOT EXISTS live_participants (
  streamId TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  handRaised INTEGER NOT NULL DEFAULT 0,
  mutedByHost INTEGER NOT NULL DEFAULT 0,
  joinedAt TEXT NOT NULL,
  PRIMARY KEY (streamId, userId)
);

CREATE TABLE IF NOT EXISTS live_messages (
  id TEXT PRIMARY KEY,
  streamId TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_live_messages_stream ON live_messages(streamId, createdAt);
`);

// Метки безопасности, которые администратор заводит сам.
//
// Пять встроенных (СКАМ, ФЕЙК и прочие) были зашиты в коде в двух местах
// сразу — на сервере и в клиенте, — и добавить шестую значило выпускать новую
// версию приложения. Теперь это строки в базе; встроенные просто засеяны при
// первом запуске и ничем не отличаются от добавленных вручную.
db.exec(`
CREATE TABLE IF NOT EXISTS safety_labels (
  id TEXT PRIMARY KEY,
  short TEXT NOT NULL,
  label TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  color TEXT,
  createdAt TEXT NOT NULL
);
`);
if (!db.prepare("SELECT COUNT(*) AS n FROM safety_labels").get().n) {
  const seed = db.prepare("INSERT INTO safety_labels (id, short, label, hint, color, createdAt) VALUES (?, ?, ?, ?, ?, ?)");
  const now = new Date().toISOString();
  for (const row of [
    ["scam", "СКАМ", "Мошенничество", "Аккаунт замечен в мошенничестве. Не переводите деньги и не сообщайте коды.", "#c6403b"],
    ["fake", "ФЕЙК", "Поддельный аккаунт", "Аккаунт выдаёт себя за другого человека или организацию.", "#b9791c"],
    ["terrorism", "ТЕРРОРИЗМ", "Терроризм", "Аккаунт связан с террористической деятельностью или её пропагандой.", "#c6403b"],
    ["extremism", "ЭКСТРЕМИЗМ", "Экстремизм", "Аккаунт замечен в распространении экстремистских материалов.", "#c6403b"],
    ["drugs", "НАРКОТИКИ", "Продажа наркотиков", "Аккаунт замечен в продаже запрещённых веществ.", "#1f9d63"],
  ]) seed.run(...row, now);
}

// ── Рекламный кабинет для бизнеса (server/routes/ads.js) ───────────────────
//
// Раньше «реклама» была одним объявлением, привязанным к профилю: текст, ссылка
// и всё. Кабинет — это уже несколько кампаний, у каждой свои деньги, место
// показа, состояние и счётчики.
//
// Деньги — звёзды, та же валюта, что и в подарках: заводить вторую значило бы
// объяснять человеку, чем «рекламные рубли» отличаются от звёзд у него же на
// балансе. Списание идёт за показы (цена за тысячу), поэтому в кампании
// хранится и остаток бюджета, и потраченное.
//
// status: draft | review | active | paused | rejected | finished
// placement: profile (своя публичная страница) | discover (каталог каналов)
db.exec(`
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  url TEXT,
  imageUrl TEXT,
  placement TEXT NOT NULL DEFAULT 'discover',
  status TEXT NOT NULL DEFAULT 'draft',
  rejectReason TEXT,
  budgetStars INTEGER NOT NULL DEFAULT 0,
  spentStars INTEGER NOT NULL DEFAULT 0,
  cpmStars INTEGER NOT NULL DEFAULT 20,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_owner ON ad_campaigns(ownerId);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status, placement);

-- По дням, чтобы в кабинете был график, а не одно число за всё время.
CREATE TABLE IF NOT EXISTS ad_daily (
  campaignId TEXT NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spentStars INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (campaignId, day)
);
`);

// ── Маркет: магазины, товары, заказы ────────────────────────────────────────
//
// Зачем отдельные таблицы, а не «канал с постами-товарами»: у заказа есть
// состояние и деньги, и то и другое надо потом показать обеим сторонам —
// перепиской это не выражается.
//
// Магазин — один на аккаунт (ownerId UNIQUE). Двух магазинов у одного продавца
// не бывает ни в одном сценарии, который тут нужен, а UNIQUE снимает целый
// класс вопросов «какой из них показывать в рекламе».
//
// Оплата у товара своя: 'stars' — звёздами внутри приложения, 'cash' — деньгами
// при встрече/доставке, о которых стороны договариваются в чате. Это выбор
// продавца на каждый товар: цифровой товар без звёзд продать нельзя, а мешок
// картошки за звёзды никто продавать не станет.
db.exec(`
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  imageUrl TEXT,
  city TEXT NOT NULL DEFAULT '',
  isOpen INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_shops_open ON shops(isOpen);

CREATE TABLE IF NOT EXISTS shop_products (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  imageUrl TEXT,
  payKind TEXT NOT NULL DEFAULT 'stars',
  priceStars INTEGER NOT NULL DEFAULT 0,
  priceRub INTEGER NOT NULL DEFAULT 0,
  -- -1 значит «сколько угодно»: у цифрового товара запаса нет вовсе, и
  -- заставлять продавца писать туда выдуманное число незачем.
  stock INTEGER NOT NULL DEFAULT -1,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_shop_products_shop ON shop_products(shopId, isActive);

-- Название и цена скопированы в заказ, а не взяты ссылкой на товар: товар
-- переименуют, подорожает или его удалят — а заказ должен читаться таким,
-- каким его сделали.
CREATE TABLE IF NOT EXISTS shop_orders (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  productId TEXT NOT NULL,
  productTitle TEXT NOT NULL DEFAULT '',
  buyerId TEXT NOT NULL,
  sellerId TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  payKind TEXT NOT NULL DEFAULT 'stars',
  amountStars INTEGER NOT NULL DEFAULT 0,
  amountRub INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT NOT NULL DEFAULT '',
  chatId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_buyer ON shop_orders(buyerId, createdAt);
CREATE INDEX IF NOT EXISTS idx_shop_orders_shop ON shop_orders(shopId, status);
`);

// Эфир из внешней программы (OBS Studio и любая другая, умеющая RTMP).
//
// source различает два совершенно разных пути картинки: "webrtc" — ведущий
// вещает из браузера напрямую зрителям, "rtmp" — картинка приходит на сервер
// по RTMP и раздаётся зрителям как поток (см. server/rtmp.js). Всё остальное у
// эфира общее: тот же чат, те же участники, та же плашка в чате.
//
// streamKey — то, что вставляют в OBS в поле «Ключ потока». Он же пароль на
// вещание, поэтому отдаётся только ведущему и никогда не попадает в адрес, по
// которому смотрят зрители (те ходят через прокси в routes/live.js).
//
// rtmpLive — «программа сейчас на связи». Эфир может быть создан за минуту до
// того, как ведущий нажмёт в OBS «Запустить трансляцию», и зрителю надо
// показать «ведущий ещё не начал», а не чёрный квадрат.
const existingLiveColumns = new Set(db.prepare("PRAGMA table_info(live_streams)").all().map((c) => c.name));
if (!existingLiveColumns.has("source")) db.exec("ALTER TABLE live_streams ADD COLUMN source TEXT NOT NULL DEFAULT 'webrtc'");
if (!existingLiveColumns.has("streamKey")) db.exec("ALTER TABLE live_streams ADD COLUMN streamKey TEXT");
if (!existingLiveColumns.has("rtmpLive")) db.exec("ALTER TABLE live_streams ADD COLUMN rtmpLive INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE INDEX IF NOT EXISTS idx_live_streams_key ON live_streams(streamKey)");

// Объявления — доска в духе «Авито», рядом с магазинами, а не вместо них.
//
// Почему отдельная таблица, а не поля у shop_products: это разные вещи по
// смыслу. Товар лежит в магазине, у него есть остаток, оплата звёздами и
// эскроу. Объявление публикует любой человек про одну свою вещь, оплаты через
// сервис нет вообще — договариваются в переписке, деньги и передача мимо нас.
// Смешать это в одной таблице значило бы половину колонок держать пустыми и
// на каждом запросе выяснять, что перед нами.
//
// Доставки здесь нет и не планируется. cdekPriceRub — просто число, которое
// продавец написал: «отправлю СДЭК, доставка примерно столько». Никакого
// вызова курьера, расчёта тарифа и отслеживания: отправляет продавец сам, а
// поле существует, чтобы покупатель заранее знал цену вопроса и не спрашивал
// об этом в каждой переписке.
db.exec(`
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  sellerId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  -- "new" | "used": на доске объявлений это первое, что спрашивают.
  condition TEXT NOT NULL DEFAULT 'used',
  priceRub INTEGER NOT NULL DEFAULT 0,
  -- Цену можно не ставить вовсе — «даром» и «договорная» это разные вещи,
  -- поэтому отдельным флагом, а не нулём в цене.
  isNegotiable INTEGER NOT NULL DEFAULT 0,
  city TEXT NOT NULL DEFAULT '',
  -- Фотографии — массив ссылок на /uploads (JSON). Не data:-строки: см.
  -- комментарий про размер базы в components/composer.js.
  photos TEXT NOT NULL DEFAULT '[]',
  -- Сколько, по словам продавца, стоит отправка СДЭК. 0 или NULL — «не
  -- отправляю, только самовывоз».
  cdekPriceRub INTEGER,
  -- "active" | "sold" | "archived"
  status TEXT NOT NULL DEFAULT 'active',
  views INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(sellerId, createdAt);
-- Лента и фильтры всегда идут по живым объявлениям: частичный индекс вчетверо
-- меньше полного и не трогается, когда объявление закрыли.
CREATE INDEX IF NOT EXISTS idx_listings_feed ON listings(category, createdAt) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS listing_favorites (
  userId TEXT NOT NULL,
  listingId TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (userId, listingId)
);
CREATE INDEX IF NOT EXISTS idx_listing_favorites_user ON listing_favorites(userId, createdAt);
`);

module.exports = db;
