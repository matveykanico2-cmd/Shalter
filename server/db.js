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

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  userId TEXT NOT NULL,
  addedAt TEXT NOT NULL
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
`);

// Ad-hoc migration for columns added after this db.js's CREATE TABLE
// statements were first written — CREATE TABLE IF NOT EXISTS is a no-op on a
// database file that already has the `users` table (from before Premium/
// referrals existed), so those columns need to be bolted on separately here.
const existingUserColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!existingUserColumns.has("isPremium")) db.exec("ALTER TABLE users ADD COLUMN isPremium INTEGER NOT NULL DEFAULT 0");
if (!existingUserColumns.has("referralCode")) db.exec("ALTER TABLE users ADD COLUMN referralCode TEXT");
if (!existingUserColumns.has("referredBy")) db.exec("ALTER TABLE users ADD COLUMN referredBy TEXT");
// Premium is time-boxed (a duration, like a real subscription) rather than a
// permanent flag — premiumUntil is the actual source of truth; the isPremium
// column above is kept only as a legacy/compat field and is no longer read
// (see rowToUser in server/data/users.js, which computes it from this instead).
if (!existingUserColumns.has("premiumUntil")) db.exec("ALTER TABLE users ADD COLUMN premiumUntil TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone <> ''");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referralCode) WHERE referralCode IS NOT NULL");

// Same ad-hoc migration for `bots` — real user-programmable bots (a token +
// owner, see server/routes/botApi.js) were added after this table already
// existed in deployed databases.
const existingBotColumns = new Set(db.prepare("PRAGMA table_info(bots)").all().map((c) => c.name));
if (!existingBotColumns.has("ownerId")) db.exec("ALTER TABLE bots ADD COLUMN ownerId TEXT");
if (!existingBotColumns.has("token")) db.exec("ALTER TABLE bots ADD COLUMN token TEXT");
if (!existingBotColumns.has("createdAt")) db.exec("ALTER TABLE bots ADD COLUMN createdAt TEXT");
// In-app programmable bots (server/lib/botSandbox.js) — a `handleMessage`
// function the owner writes in the built-in editor, run server-side in a
// restricted vm sandbox on every incoming message, as an alternative to
// running an external script against the Bot API.
if (!existingBotColumns.has("code")) db.exec("ALTER TABLE bots ADD COLUMN code TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_token ON bots(token) WHERE token IS NOT NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(ownerId)");

module.exports = db;
