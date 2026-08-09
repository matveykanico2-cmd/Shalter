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
// This account's ECDH (P-256) public key, JWK-encoded — public/js/lib/e2e.js
// generates the matching private key client-side and never uploads it. The
// server only ever relays this public half, used by the *other* side of a
// secret chat (server/routes/chats.js's /:id/secret create route) to derive
// a shared AES-GCM key locally; the server itself can never derive it (it
// only ever sees one half of each ECDH pair) and stores/relays ciphertext
// only for secret-chat messages (see routes/messages.js's skip-server-side-
// text-processing-for-secret-chats guards).
if (!existingUserColumns.has("e2ePublicKey")) db.exec("ALTER TABLE users ADD COLUMN e2ePublicKey TEXT");
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
} catch (err) {
  console.error("Could not create unique username index (likely pre-existing duplicate usernames):", err.message);
}

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

module.exports = db;
