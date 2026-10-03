const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(process.cwd(), "data", "app.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.pragma("cache_size = -32000");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("mmap_size = 268435456");
db.pragma("temp_store = MEMORY");

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

-- Поисковый указатель по сообщениям — см. messages_search ниже, после
-- миграций столбцов: он строится по зашифрованному тексту (lib/textCrypto.js).

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

-- DonatePay (server/lib/donatePay.js) — a static API token instead of OAuth
-- (see DONATEPAY_API_TOKEN in .env), so the only state to persist is the
-- sweep's watermark, same role as donation_alerts_auth's lastDonationId.
CREATE TABLE IF NOT EXISTS donate_pay_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lastTransactionId INTEGER NOT NULL DEFAULT 0
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

-- Настройки уровня всего приложения, которые админ меняет без деплоя (цены —
-- server/data/pricing.js). Ключ → JSON.
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_orders_user ON pending_orders(userId);

-- "Войти через Shalter" — any account can register a third-party app here
-- (server/routes/oauth.js), the same self-service shape as a bot
-- (server/data/bots.js): no admin approval, a token identifies the app.
-- clientSecret is a bearer credential exactly like a bot token — plain text
-- by the same reasoning bots.js's token is (see that file), not hashed.
CREATE TABLE IF NOT EXISTS oauth_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  clientId TEXT NOT NULL,
  clientSecret TEXT NOT NULL,
  redirectUri TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_apps_client_id ON oauth_apps(clientId);
CREATE INDEX IF NOT EXISTS idx_oauth_apps_owner ON oauth_apps(ownerId);

-- Short-lived authorization codes (standard OAuth "authorization code"
-- step) — minted when the account approves the consent screen, redeemed
-- exactly once at POST /api/oauth/token in exchange for an access token.
-- Expiring and single-use so a code leaked via referrer/browser history
-- can't be replayed later.
CREATE TABLE IF NOT EXISTS oauth_codes (
  code TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT NOT NULL,
  redirectUri TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  usedAt TEXT
);

-- Long-lived bearer tokens a third-party app holds after redeeming a code —
-- what it sends back on every GET /api/oauth/userinfo call. No refresh/
-- expiry flow for now (same "simple, not enterprise SSO" scope as the rest
-- of this app) — revoking means the account owner deletes the app itself
-- (oauth_apps, cascaded by clientId below), or an admin bans the account.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token TEXT PRIMARY KEY,
  clientId TEXT NOT NULL,
  userId TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_client ON oauth_tokens(clientId);

-- Кто кому уже отправил напоминание о дне рождения в этом году
-- (server/lib/birthdaySweep.js) — без этого повторный проход подметальщика
-- (перезапуск сервера, несколько тиков за день) слал бы одно и то же
-- поздравление по кругу.
CREATE TABLE IF NOT EXISTS birthday_greetings_sent (
  ownerId TEXT NOT NULL,
  birthdayUserId TEXT NOT NULL,
  year INTEGER NOT NULL,
  sentAt TEXT NOT NULL,
  PRIMARY KEY (ownerId, birthdayUserId, year)
);

-- Кому уже отправлено напоминание о каком празднике в этом году
-- (server/lib/holidaySweep.js) — тот же смысл, что и у таблицы выше, только
-- праздник шлётся самому человеку, а не его контактам (dm с собой, а не с
-- владельцами контакта).
CREATE TABLE IF NOT EXISTS holiday_notifications_sent (
  userId TEXT NOT NULL,
  holidayId TEXT NOT NULL,
  year INTEGER NOT NULL,
  sentAt TEXT NOT NULL,
  PRIMARY KEY (userId, holidayId, year)
);

-- Shalter для бизнеса: приветствие шлётся один раз за всю историю чата,
-- автоответ (вне часов работы) — не чаще раза в день на чат. Один и тот же
-- смысл, что у holiday_notifications_sent выше — "пытались ли мы уже",
-- ключ по chatId (а не по паре пользователей), потому что это личное дело
-- ровно этого чата.
CREATE TABLE IF NOT EXISTS business_auto_replies_sent (
  chatId TEXT NOT NULL,
  kind TEXT NOT NULL,
  sentDate TEXT NOT NULL,
  sentAt TEXT NOT NULL,
  PRIMARY KEY (chatId, kind, sentDate)
);

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

-- Кастомные эмодзи, нарисованные пользователем в аниматоре (public/js/lib/
-- customScene.js). Как и стикеры в паке, эмодзи-сцена уходит в чужие чаты, но
-- вставляется прямо в текст сообщения (server/data/messages.js). Сцена лежит
-- JSON-колонкой: её только читают/пишут целиком, а не запрашивают по полям, —
-- то же правило, что у стикеров пака.
CREATE TABLE IF NOT EXISTS custom_emoji (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  scene TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custom_emoji_owner ON custom_emoji(ownerId);

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
  mediaUrl TEXT,
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

const existingStoryColumns = new Set(db.prepare("PRAGMA table_info(stories)").all().map((c) => c.name));
if (!existingStoryColumns.has("items")) db.exec("ALTER TABLE stories ADD COLUMN items TEXT");
if (!existingStoryColumns.has("likedByIds")) db.exec("ALTER TABLE stories ADD COLUMN likedByIds TEXT NOT NULL DEFAULT '[]'");

db.exec(`
CREATE TABLE IF NOT EXISTS story_comments (
  id TEXT PRIMARY KEY,
  storyId TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_story_comments_story ON story_comments(storyId, createdAt);
`);

const existingStoryCommentCols = new Set(db.prepare("PRAGMA table_info(story_comments)").all().map((c) => c.name));
if (!existingStoryCommentCols.has("parentId")) db.exec("ALTER TABLE story_comments ADD COLUMN parentId TEXT");
if (!existingStoryCommentCols.has("likedByIds")) db.exec("ALTER TABLE story_comments ADD COLUMN likedByIds TEXT NOT NULL DEFAULT '[]'");

// Что именно куплено (срок тарифа, число звёзд) — снимок на момент заказа.
// Раньше тариф угадывался по сумме, и после смены цены админом старые заказы
// переставали находить свой тариф.
const existingOrderColumns = new Set(db.prepare("PRAGMA table_info(pending_orders)").all().map((c) => c.name));
if (!existingOrderColumns.has("meta")) db.exec("ALTER TABLE pending_orders ADD COLUMN meta TEXT");
const existingUserColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!existingUserColumns.has("isPremium")) db.exec("ALTER TABLE users ADD COLUMN isPremium INTEGER NOT NULL DEFAULT 0");
if (!existingUserColumns.has("referralCode")) db.exec("ALTER TABLE users ADD COLUMN referralCode TEXT");
if (!existingUserColumns.has("referredBy")) db.exec("ALTER TABLE users ADD COLUMN referredBy TEXT");
if (!existingUserColumns.has("lastName")) db.exec("ALTER TABLE users ADD COLUMN lastName TEXT");
if (!existingUserColumns.has("premiumUntil")) db.exec("ALTER TABLE users ADD COLUMN premiumUntil TEXT");
if (!existingUserColumns.has("scheduledDeletionAt")) db.exec("ALTER TABLE users ADD COLUMN scheduledDeletionAt TEXT");
if (!existingUserColumns.has("adsUntil")) db.exec("ALTER TABLE users ADD COLUMN adsUntil TEXT");
if (!existingUserColumns.has("adText")) db.exec("ALTER TABLE users ADD COLUMN adText TEXT");
if (!existingUserColumns.has("adUrl")) db.exec("ALTER TABLE users ADD COLUMN adUrl TEXT");
if (!existingUserColumns.has("businessUntil")) db.exec("ALTER TABLE users ADD COLUMN businessUntil TEXT");
if (!existingUserColumns.has("businessAddress")) db.exec("ALTER TABLE users ADD COLUMN businessAddress TEXT");
if (!existingUserColumns.has("businessLat")) db.exec("ALTER TABLE users ADD COLUMN businessLat REAL");
if (!existingUserColumns.has("businessLng")) db.exec("ALTER TABLE users ADD COLUMN businessLng REAL");
if (!existingUserColumns.has("adAttachments")) db.exec("ALTER TABLE users ADD COLUMN adAttachments TEXT");
if (!existingUserColumns.has("birthday")) db.exec("ALTER TABLE users ADD COLUMN birthday TEXT");
if (!existingUserColumns.has("giftsReceived")) db.exec("ALTER TABLE users ADD COLUMN giftsReceived TEXT NOT NULL DEFAULT '[]'");
if (!existingUserColumns.has("isBanned")) db.exec("ALTER TABLE users ADD COLUMN isBanned INTEGER NOT NULL DEFAULT 0");
if (!existingUserColumns.has("banReason")) db.exec("ALTER TABLE users ADD COLUMN banReason TEXT");
if (!existingUserColumns.has("bannedAt")) db.exec("ALTER TABLE users ADD COLUMN bannedAt TEXT");
if (!existingUserColumns.has("safetyLabel")) db.exec("ALTER TABLE users ADD COLUMN safetyLabel TEXT");
if (!existingUserColumns.has("safetyLabelAt")) db.exec("ALTER TABLE users ADD COLUMN safetyLabelAt TEXT");
if (!existingUserColumns.has("stars")) db.exec("ALTER TABLE users ADD COLUMN stars INTEGER NOT NULL DEFAULT 0");
if (!existingUserColumns.has("messagePriceStars")) db.exec("ALTER TABLE users ADD COLUMN messagePriceStars INTEGER NOT NULL DEFAULT 0");
if (!existingUserColumns.has("statusItems")) db.exec("ALTER TABLE users ADD COLUMN statusItems TEXT NOT NULL DEFAULT '[]'");
if (!existingUserColumns.has("activeStatusId")) db.exec("ALTER TABLE users ADD COLUMN activeStatusId TEXT");

if (!existingUserColumns.has("totpSecret")) db.exec("ALTER TABLE users ADD COLUMN totpSecret TEXT");
if (!existingUserColumns.has("totpEnabledAt")) db.exec("ALTER TABLE users ADD COLUMN totpEnabledAt TEXT");
if (!existingUserColumns.has("totpRecoveryCodes")) db.exec("ALTER TABLE users ADD COLUMN totpRecoveryCodes TEXT");

const kugoRow = db.prepare("SELECT id FROM users WHERE id = 'ai_kugo'").get();
if (kugoRow) {
  const kugoChats = db.prepare("SELECT chatId FROM chat_members WHERE userId = 'ai_kugo'").all().map((r) => r.chatId);
  for (const chatId of kugoChats) {
    db.prepare("DELETE FROM messages WHERE chatId = ?").run(chatId);
    db.prepare("DELETE FROM chats WHERE id = ?").run(chatId);
  }
  db.prepare("DELETE FROM bots WHERE userId = 'ai_kugo'").run();
  db.prepare("DELETE FROM users WHERE id = 'ai_kugo'").run();
  console.log(`removed the retired Kugo AI assistant account (${kugoChats.length} chat(s))`);
}

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone <> ''");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referralCode) WHERE referralCode IS NOT NULL");
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE) WHERE username <> ''");
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(lower(username))");
} catch (err) {
  console.error("Could not create unique username index (likely pre-existing duplicate usernames):", err.message);
}

const existingReportColumns = new Set(db.prepare("PRAGMA table_info(reports)").all().map((c) => c.name));
if (!existingReportColumns.has("subjectUserId")) db.exec("ALTER TABLE reports ADD COLUMN subjectUserId TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_reports_subject ON reports(subjectUserId)");
db.exec("CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)");

const existingContactCols = new Set(db.prepare("PRAGMA table_info(contacts)").all().map((c) => c.name));
if (!existingContactCols.has("localName")) db.exec("ALTER TABLE contacts ADD COLUMN localName TEXT");

const existingTwoFactorCols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!existingTwoFactorCols.has("twoFactorMethod")) db.exec("ALTER TABLE users ADD COLUMN twoFactorMethod TEXT");
if (!existingTwoFactorCols.has("cloudPasswordHash")) db.exec("ALTER TABLE users ADD COLUMN cloudPasswordHash TEXT");
if (!existingTwoFactorCols.has("cloudPasswordSalt")) db.exec("ALTER TABLE users ADD COLUMN cloudPasswordSalt TEXT");
if (!existingTwoFactorCols.has("cloudPasswordHint")) db.exec("ALTER TABLE users ADD COLUMN cloudPasswordHint TEXT");

if (!existingTwoFactorCols.has("usernameAuctionId")) db.exec("ALTER TABLE users ADD COLUMN usernameAuctionId TEXT");

if (!existingTwoFactorCols.has("isVerified")) db.exec("ALTER TABLE users ADD COLUMN isVerified INTEGER NOT NULL DEFAULT 0");
const existingChatVerifyCols2 = new Set(db.prepare("PRAGMA table_info(chats)").all().map((c) => c.name));
if (!existingChatVerifyCols2.has("isVerified")) db.exec("ALTER TABLE chats ADD COLUMN isVerified INTEGER NOT NULL DEFAULT 0");

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

if (!existingChatVerifyCols2.has("mutedUntil")) db.exec("ALTER TABLE chats ADD COLUMN mutedUntil TEXT");

if (!existingChatVerifyCols2.has("slowModeSeconds")) db.exec("ALTER TABLE chats ADD COLUMN slowModeSeconds INTEGER");

if (!existingChatVerifyCols2.has("commentPriceStars")) db.exec("ALTER TABLE chats ADD COLUMN commentPriceStars INTEGER NOT NULL DEFAULT 0");

if (!existingChatVerifyCols2.has("permissions")) db.exec("ALTER TABLE chats ADD COLUMN permissions TEXT");

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

if (!existingChatVerifyCols2.has("signMessages")) db.exec("ALTER TABLE chats ADD COLUMN signMessages INTEGER NOT NULL DEFAULT 0");

const existingFolderColumns = new Set(db.prepare("PRAGMA table_info(folders)").all().map((c) => c.name));
if (!existingFolderColumns.has("inviteCode")) db.exec("ALTER TABLE folders ADD COLUMN inviteCode TEXT");
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_invite_code ON folders(inviteCode) WHERE inviteCode IS NOT NULL");
} catch (err) {
  console.error("Could not create unique folder invite-code index:", err.message);
}

if (!existingChatVerifyCols2.has("anonymousAdmins")) db.exec("ALTER TABLE chats ADD COLUMN anonymousAdmins INTEGER NOT NULL DEFAULT 0");

if (!existingChatVerifyCols2.has("inviteCode")) db.exec("ALTER TABLE chats ADD COLUMN inviteCode TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_invite ON chats(inviteCode) WHERE inviteCode IS NOT NULL");

if (!existingChatVerifyCols2.has("wallpaper")) db.exec("ALTER TABLE chats ADD COLUMN wallpaper TEXT");

if (!existingChatVerifyCols2.has("allowedReactions")) db.exec("ALTER TABLE chats ADD COLUMN allowedReactions TEXT");

if (!existingUserColumns.has("avatarImages")) db.exec("ALTER TABLE users ADD COLUMN avatarImages TEXT NOT NULL DEFAULT '[]'");

if (!existingUserColumns.has("nearbyLat")) db.exec("ALTER TABLE users ADD COLUMN nearbyLat REAL");
if (!existingUserColumns.has("nearbyLng")) db.exec("ALTER TABLE users ADD COLUMN nearbyLng REAL");
if (!existingUserColumns.has("nearbyUpdatedAt")) db.exec("ALTER TABLE users ADD COLUMN nearbyUpdatedAt TEXT");

const existingGiftCatalogCols = new Set(db.prepare("PRAGMA table_info(gift_catalog)").all().map((c) => c.name));
if (!existingGiftCatalogCols.has("priceStars")) db.exec("ALTER TABLE gift_catalog ADD COLUMN priceStars INTEGER");
if (!existingGiftCatalogCols.has("mediaUrl")) db.exec("ALTER TABLE gift_catalog ADD COLUMN mediaUrl TEXT");
if (!existingGiftCatalogCols.has("hidden")) db.exec("ALTER TABLE gift_catalog ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
if (!existingGiftCatalogCols.has("scene")) db.exec("ALTER TABLE gift_catalog ADD COLUMN scene TEXT");
if (!existingGiftCatalogCols.has("ownerId")) db.exec("ALTER TABLE gift_catalog ADD COLUMN ownerId TEXT");

const existingMessageCols = new Set(db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name));
if (!existingMessageCols.has("boostedUntil")) db.exec("ALTER TABLE messages ADD COLUMN boostedUntil TEXT");
if (!existingMessageCols.has("boostedById")) db.exec("ALTER TABLE messages ADD COLUMN boostedById TEXT");
if (!existingMessageCols.has("customEmoji")) db.exec("ALTER TABLE messages ADD COLUMN customEmoji TEXT");

const existingMemberCols = new Set(db.prepare("PRAGMA table_info(chat_members)").all().map((c) => c.name));
if (!existingMemberCols.has("isModerator")) db.exec("ALTER TABLE chat_members ADD COLUMN isModerator INTEGER NOT NULL DEFAULT 0");
if (!existingMemberCols.has("isOwner")) {
  db.exec("ALTER TABLE chat_members ADD COLUMN isOwner INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE chat_members SET isOwner = 1 WHERE userId = (SELECT ownerId FROM chats WHERE chats.id = chat_members.chatId)");
}
const existingChatCols2 = new Set(db.prepare("PRAGMA table_info(chats)").all().map((c) => c.name));
if (!existingChatCols2.has("memberTitles")) db.exec("ALTER TABLE chats ADD COLUMN memberTitles TEXT");

const existingBotColumns = new Set(db.prepare("PRAGMA table_info(bots)").all().map((c) => c.name));
if (!existingBotColumns.has("ownerId")) db.exec("ALTER TABLE bots ADD COLUMN ownerId TEXT");
if (!existingBotColumns.has("token")) db.exec("ALTER TABLE bots ADD COLUMN token TEXT");
if (!existingBotColumns.has("createdAt")) db.exec("ALTER TABLE bots ADD COLUMN createdAt TEXT");
if (!existingBotColumns.has("code")) db.exec("ALTER TABLE bots ADD COLUMN code TEXT");
if (!existingBotColumns.has("appUrl")) db.exec("ALTER TABLE bots ADD COLUMN appUrl TEXT");
if (!existingBotColumns.has("appName")) db.exec("ALTER TABLE bots ADD COLUMN appName TEXT");
if (!existingBotColumns.has("appCode")) db.exec("ALTER TABLE bots ADD COLUMN appCode TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_token ON bots(token) WHERE token IS NOT NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(ownerId)");

const existingMessageColumns = new Set(db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name));
if (!existingMessageColumns.has("gift")) db.exec("ALTER TABLE messages ADD COLUMN gift TEXT");
if (!existingMessageColumns.has("paidStars")) db.exec("ALTER TABLE messages ADD COLUMN paidStars INTEGER NOT NULL DEFAULT 0");
if (!existingMessageColumns.has("anonymous")) db.exec("ALTER TABLE messages ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0");
if (!existingMessageColumns.has("sticker")) db.exec("ALTER TABLE messages ADD COLUMN sticker TEXT");
if (!existingMessageColumns.has("linkPreview")) db.exec("ALTER TABLE messages ADD COLUMN linkPreview TEXT");
if (!existingMessageColumns.has("report")) db.exec("ALTER TABLE messages ADD COLUMN report TEXT");
if (!existingMessageColumns.has("mentionedUserIds")) db.exec("ALTER TABLE messages ADD COLUMN mentionedUserIds TEXT NOT NULL DEFAULT '[]'");
if (!existingMessageColumns.has("threadRootId")) db.exec("ALTER TABLE messages ADD COLUMN threadRootId TEXT");
if (!existingMessageColumns.has("storyReply")) db.exec("ALTER TABLE messages ADD COLUMN storyReply TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_messages_threadRoot ON messages(threadRootId)");

const existingChatColumns = new Set(db.prepare("PRAGMA table_info(chats)").all().map((c) => c.name));
if (!existingChatColumns.has("restrictions")) db.exec("ALTER TABLE chats ADD COLUMN restrictions TEXT");
if (!existingChatColumns.has("points")) db.exec("ALTER TABLE chats ADD COLUMN points INTEGER NOT NULL DEFAULT 0");
if (!existingChatColumns.has("votes")) db.exec("ALTER TABLE chats ADD COLUMN votes TEXT");
if (!existingChatColumns.has("autoDeleteSeconds")) db.exec("ALTER TABLE chats ADD COLUMN autoDeleteSeconds INTEGER");
if (!existingChatColumns.has("warnings")) db.exec("ALTER TABLE chats ADD COLUMN warnings TEXT");
if (!existingChatColumns.has("rules")) db.exec("ALTER TABLE chats ADD COLUMN rules TEXT");
if (!existingChatColumns.has("bannedIds")) db.exec("ALTER TABLE chats ADD COLUMN bannedIds TEXT");

const existingCallColumns = new Set(db.prepare("PRAGMA table_info(calls)").all().map((c) => c.name));
if (!existingCallColumns.has("joinToken")) db.exec("ALTER TABLE calls ADD COLUMN joinToken TEXT");
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_join_token ON calls(joinToken) WHERE joinToken IS NOT NULL");
} catch (err) {
  console.error("Could not create unique call join-token index:", err.message);
}

const existingSessionColumns = new Set(db.prepare("PRAGMA table_info(sessions)").all().map((c) => c.name));
if (!existingSessionColumns.has("revokedAt")) db.exec("ALTER TABLE sessions ADD COLUMN revokedAt TEXT");

require("./lib/keyring").init(db);
const textCrypto = require("./lib/textCrypto");
textCrypto.loadKeys();

db.function("msg_search_tokens", { deterministic: true }, (id, text) =>
  textCrypto.searchTokens(textCrypto.decryptText(id, text))
);

if (!existingMessageColumns.has("hasLink")) db.exec("ALTER TABLE messages ADD COLUMN hasLink INTEGER NOT NULL DEFAULT 0");

try {
  let purgePlaintext = false;
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'messages_fts'").get()) {
    db.exec(`
      DROP TRIGGER IF EXISTS messages_fts_ai;
      DROP TRIGGER IF EXISTS messages_fts_ad;
      DROP TRIGGER IF EXISTS messages_fts_au;
      DROP TABLE IF EXISTS messages_fts;
    `);
    purgePlaintext = true;
  }

  const plainBatch = db.prepare(
    "SELECT rowid AS rid, id, text FROM messages WHERE text <> '' AND substr(text, 1, 5) NOT IN ('enc1:', 'enc2:') LIMIT 1000"
  );
  const setEncrypted = db.prepare("UPDATE messages SET text = ?, hasLink = ? WHERE rowid = ?");
  const encryptRows = db.transaction((rows) => {
    for (const r of rows) setEncrypted.run(textCrypto.encryptText(r.id, r.text), textCrypto.hasLink(r.text), r.rid);
  });
  let encrypted = 0;
  for (let rows = plainBatch.all(); rows.length; rows = plainBatch.all()) {
    encryptRows(rows);
    encrypted += rows.length;
  }
  if (encrypted) {
    console.log(`[db] зашифровано ${encrypted} сообщений`);
    purgePlaintext = true;
  }

  // Остальной приватный текст — отложенные сообщения, заметки, напоминания —
  // тем же ключом. Префикс в id (AAD) свой у каждой таблицы, чтобы шифротекст
  // нельзя было переложить из одной таблицы в другую.
  for (const [table, aad] of [
    ["scheduled_messages", "sched:"],
    ["notes", "note:"],
    ["reminders", "remind:"],
  ]) {
    // notes и reminders создаются ниже по файлу — на новой базе их ещё нет.
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) continue;
    const rows = db
      .prepare(`SELECT rowid AS rid, id, text FROM ${table} WHERE text <> '' AND substr(text, 1, 5) NOT IN ('enc1:', 'enc2:')`)
      .all();
    if (!rows.length) continue;
    const set = db.prepare(`UPDATE ${table} SET text = ? WHERE rowid = ?`);
    db.transaction(() => {
      for (const r of rows) set.run(textCrypto.encryptText(aad + r.id, r.text), r.rid);
    })();
    console.log(`[db] зашифровано записей в ${table}: ${rows.length}`);
    purgePlaintext = true;
  }

  let rebuildIndex = false;
  if (purgePlaintext) {
    console.log("[db] переписываем базу, чтобы в ней не осталось открытого текста…");
    db.exec("VACUUM");
    db.pragma("wal_checkpoint(TRUNCATE)");
    rebuildIndex = true;
  }

  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'messages_search'").get()) rebuildIndex = true;
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_search USING fts5(
      tokens,
      content='',
      contentless_delete=1,
      detail=none,
      tokenize='ascii'
    );
    -- Триггеры, а не код в data/messages.js, по той же причине, что и раньше:
    -- удаление каскадом вместе с чатом мимо кода проходит, а указатель должен
    -- забыть и такие сообщения.
    CREATE TRIGGER IF NOT EXISTS messages_search_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_search(rowid, tokens) VALUES (new.rowid, msg_search_tokens(new.id, new.text));
    END;
    CREATE TRIGGER IF NOT EXISTS messages_search_ad AFTER DELETE ON messages BEGIN
      DELETE FROM messages_search WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS messages_search_au AFTER UPDATE OF text ON messages WHEN old.text IS NOT new.text BEGIN
      DELETE FROM messages_search WHERE rowid = old.rowid;
      INSERT INTO messages_search(rowid, tokens) VALUES (new.rowid, msg_search_tokens(new.id, new.text));
    END;
  `);
  if (rebuildIndex) {
    db.transaction(() => {
      db.exec("INSERT INTO messages_search(messages_search) VALUES ('delete-all')");
      db.exec("INSERT INTO messages_search(rowid, tokens) SELECT rowid, msg_search_tokens(id, text) FROM messages WHERE text <> ''");
    })();
    console.log("[db] построен поисковый указатель по зашифрованной переписке");
  }
} catch (err) {
  console.error("[db] шифрование переписки / поисковый указатель:", err.message);
  throw err;
}

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

for (const table of ["story_comments", "live_messages"]) {
  const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  if (!cols.has("editedAt")) db.exec(`ALTER TABLE ${table} ADD COLUMN editedAt TEXT`);
}

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

db.exec(`
CREATE TABLE IF NOT EXISTS profile_statuses (
  id TEXT PRIMARY KEY,
  image TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);
`);

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

const existingLiveColumns = new Set(db.prepare("PRAGMA table_info(live_streams)").all().map((c) => c.name));
if (!existingLiveColumns.has("source")) db.exec("ALTER TABLE live_streams ADD COLUMN source TEXT NOT NULL DEFAULT 'webrtc'");
if (!existingLiveColumns.has("streamKey")) db.exec("ALTER TABLE live_streams ADD COLUMN streamKey TEXT");
if (!existingLiveColumns.has("rtmpLive")) db.exec("ALTER TABLE live_streams ADD COLUMN rtmpLive INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE INDEX IF NOT EXISTS idx_live_streams_key ON live_streams(streamKey)");

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

db.exec(`
CREATE TABLE IF NOT EXISTS upload_access (
  filename TEXT NOT NULL,
  chatId TEXT NOT NULL,
  PRIMARY KEY (filename, chatId)
);
CREATE INDEX IF NOT EXISTS idx_upload_access_file ON upload_access(filename);
`);

if (!db.prepare("SELECT count(*) c FROM upload_access").get().c) {
  const insert = db.prepare("INSERT OR IGNORE INTO upload_access (filename, chatId) VALUES (?, ?)");
  const fill = db.transaction(() => {
    for (const row of db.prepare("SELECT chatId, attachments FROM messages WHERE attachments LIKE '%/uploads/%'").all()) {
      for (const m of String(row.attachments).matchAll(/\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)/g)) {
        insert.run(m[1], row.chatId);
      }
    }
  });
  fill();
}

const existingAdminSectionCols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
if (!existingAdminSectionCols.has("adminSections"))
  db.exec("ALTER TABLE users ADD COLUMN adminSections TEXT NOT NULL DEFAULT '[]'");

if (!existingAdminSectionCols.has("profileTrack")) db.exec("ALTER TABLE users ADD COLUMN profileTrack TEXT");

db.exec(`
CREATE TABLE IF NOT EXISTS short_links (
  code TEXT PRIMARY KEY,
  targetUrl TEXT NOT NULL,
  creatorId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  dueAt TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(dueAt) WHERE sent = 0;

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(userId, createdAt);

-- /daily bonus claim guard — one row per user, "have they claimed in the last
-- 24h" is a single comparison against lastClaimAt rather than a growing log.
CREATE TABLE IF NOT EXISTS daily_claims (
  userId TEXT PRIMARY KEY,
  lastClaimAt TEXT NOT NULL
);
`);

// Функции «как в Telegram»: темы в группах, приветствие новым участникам,
// запрет пересылки в личке, повтор отложенных, заметки о контактах, журнал
// действий админов, ключи доступа (passkeys).
db.exec(`
CREATE TABLE IF NOT EXISTS chat_topics (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  closed INTEGER NOT NULL DEFAULT 0,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_topics_chat ON chat_topics(chatId, createdAt);

CREATE TABLE IF NOT EXISTS chat_admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  actorId TEXT NOT NULL,
  action TEXT NOT NULL,
  targetId TEXT,
  details TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_admin_log_chat ON chat_admin_log(chatId, id);

CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  publicKey TEXT NOT NULL,
  signCount INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  createdAt TEXT NOT NULL,
  lastUsedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(userId);

-- Кэш перевода интерфейса (server/routes/translate.js /batch): одна и та же
-- надпись переводится в Google один раз на весь сервер, а не у каждого юзера.
CREATE TABLE IF NOT EXISTS translation_cache (
  lang TEXT NOT NULL,
  text TEXT NOT NULL,
  translated TEXT NOT NULL,
  PRIMARY KEY (lang, text)
) WITHOUT ROWID;
`);
{
  const chatCols = new Set(db.prepare("PRAGMA table_info(chats)").all().map((c) => c.name));
  if (!chatCols.has("topicsEnabled")) db.exec("ALTER TABLE chats ADD COLUMN topicsEnabled INTEGER NOT NULL DEFAULT 0");
  if (!chatCols.has("welcomeText")) db.exec("ALTER TABLE chats ADD COLUMN welcomeText TEXT");
  if (!chatCols.has("protectedBy")) db.exec("ALTER TABLE chats ADD COLUMN protectedBy TEXT");
  // Секретные чаты: свой ключ на чат (хранится обёрнутым мастер-ключом) и
  // привязка к устройству каждого участника — { userId: deviceId }.
  if (!chatCols.has("secret")) db.exec("ALTER TABLE chats ADD COLUMN secret INTEGER NOT NULL DEFAULT 0");
  if (!chatCols.has("secretKey")) db.exec("ALTER TABLE chats ADD COLUMN secretKey TEXT");
  if (!chatCols.has("secretDevices")) db.exec("ALTER TABLE chats ADD COLUMN secretDevices TEXT");
  const msgCols = new Set(db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name));
  if (!msgCols.has("topicId")) db.exec("ALTER TABLE messages ADD COLUMN topicId TEXT");
  // Когда сообщение в личке прочитали (для «Прочитано в 14:05»).
  if (!msgCols.has("readAt")) db.exec("ALTER TABLE messages ADD COLUMN readAt TEXT");
  // Эффект при отправке (🔥🎉…), как в личках Telegram.
  if (!msgCols.has("effect")) db.exec("ALTER TABLE messages ADD COLUMN effect TEXT");
  // Сообщение бота в группе, видное только одному участнику (остальным оно в deletedForIds).
  if (!msgCols.has("visibleToId")) db.exec("ALTER TABLE messages ADD COLUMN visibleToId TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(chatId, topicId, createdAt) WHERE topicId IS NOT NULL");
  const schedCols = new Set(db.prepare("PRAGMA table_info(scheduled_messages)").all().map((c) => c.name));
  if (!schedCols.has("repeat")) db.exec("ALTER TABLE scheduled_messages ADD COLUMN repeat TEXT");
  if (!schedCols.has("topicId")) db.exec("ALTER TABLE scheduled_messages ADD COLUMN topicId TEXT");
  const contactCols = new Set(db.prepare("PRAGMA table_info(contacts)").all().map((c) => c.name));
  if (!contactCols.has("note")) db.exec("ALTER TABLE contacts ADD COLUMN note TEXT");
}

// Сообщества (Communities): несколько групп и каналов под одной вывеской.
// Чат входит максимум в одно сообщество — отсюда PRIMARY KEY по chatId.
db.exec(`
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  avatarColor TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_chats (
  chatId TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  communityId TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  addedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_community_chats_community ON community_chats(communityId);
`);

module.exports = db;
