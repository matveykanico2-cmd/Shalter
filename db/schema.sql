CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email_verified_at INTEGER,
  phone TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  private_account INTEGER NOT NULL DEFAULT 0,
  show_activity INTEGER NOT NULL DEFAULT 1,
  allow_messages INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'post', -- 'post' | 'reel'
  caption TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id, id);

CREATE TABLE IF NOT EXISTS post_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL, -- 'image' | 'video'
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS post_media_post ON post_media(post_id, position);

CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS likes_post ON likes(post_id);

CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, id);

CREATE TABLE IF NOT EXISTS comment_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, comment_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS follows_following ON follows(following_id);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS stories_user ON stories(user_id, expires_at);

CREATE TABLE IF NOT EXISTS story_views (
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'direct',
  title TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  theme TEXT NOT NULL DEFAULT 'default',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user ON conversation_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  media_url TEXT,
  media_kind TEXT,
  voice_url TEXT,
  call_type TEXT,
  call_status TEXT,
  gift_id INTEGER REFERENCES gift_catalog(id) ON DELETE SET NULL,
  gift_name TEXT,
  gift_emoji TEXT,
  gift_price INTEGER,
  poll_question TEXT,
  poll_options TEXT,
  poll_votes TEXT,
  reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  edited_at INTEGER,
  pinned_at INTEGER,
  pinned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS message_reactions_message ON message_reactions(message_id);

CREATE TABLE IF NOT EXISTS gift_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  emoji TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO gift_catalog (name, emoji, price, created_at) VALUES
  ('Rose', '🌹', 1, 0), ('Star', '⭐', 5, 0), ('Heart', '💖', 10, 0),
  ('Fireworks', '🎆', 25, 0), ('Crown', '👑', 50, 0), ('Rocket', '🚀', 100, 0);
CREATE INDEX IF NOT EXISTS gift_catalog_active ON gift_catalog(active, id);

CREATE TABLE IF NOT EXISTS received_gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id INTEGER REFERENCES gift_catalog(id) ON DELETE SET NULL,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS received_gifts_recipient ON received_gifts(recipient_id, pinned, id);

CREATE TABLE IF NOT EXISTS communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  birthday TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_private INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS communities_owner ON communities(owner_id);

CREATE TABLE IF NOT EXISTS community_members (
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_members_user ON community_members(user_id);

CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS community_posts_feed ON community_posts(community_id, id);

CREATE TABLE IF NOT EXISTS call_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  initiator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'audio',
  status TEXT NOT NULL DEFAULT 'ringing',
  offer TEXT,
  answer TEXT,
  caller_ice TEXT NOT NULL DEFAULT '[]',
  callee_ice TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS call_sessions_conversation ON call_sessions(conversation_id, id);

CREATE TABLE IF NOT EXISTS live_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'live', -- live | ended
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS live_streams_status ON live_streams(status, id);

CREATE TABLE IF NOT EXISTS live_viewers (
  stream_id INTEGER NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (stream_id, user_id)
);
CREATE INDEX IF NOT EXISTS live_viewers_stream ON live_viewers(stream_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'like' | 'comment' | 'follow' | 'comment_like'
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, id);

CREATE TABLE IF NOT EXISTS email_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL, -- verify | reset
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_tokens_user ON email_tokens(user_id, kind, expires_at);

CREATE TABLE IF NOT EXISTS bots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bots_owner ON bots(owner_id, created_at);

CREATE TABLE IF NOT EXISTS bot_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (bot_id, command)
);
CREATE INDEX IF NOT EXISTS bot_commands_bot ON bot_commands(bot_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);

-- ---- Orders & invoices (Phase 2) ----
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'quoted', -- quoted | agreed | in_progress | delivered | paid | cancelled
  total_fils INTEGER NOT NULL DEFAULT 0, -- JOD × 1000
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_seed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS orders_buyer ON orders(buyer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_fils INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id, position);

-- Invoices/receipts copy their line items so later order edits never change an issued document.
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'invoice', -- invoice | receipt
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  issuer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at INTEGER NOT NULL,
  total_fils INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JOD',
  payment_method TEXT NOT NULL DEFAULT '',
  payment_reference TEXT NOT NULL DEFAULT '',
  paid_at INTEGER,
  is_seed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoices_order ON invoices(order_id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_fils INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice ON invoice_items(invoice_id, position);

-- ---- Reconciliation (Phase 3) ----
-- Parsed statements and the links between their rows and existing orders.
-- Matching only ever INSERTs here; orders, invoices and messages are read-only to it.
CREATE TABLE IF NOT EXISTS statement_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL DEFAULT '',
  file_hash TEXT NOT NULL,
  account_masked TEXT NOT NULL DEFAULT '',
  period_from TEXT,
  period_to TEXT,
  opening_fils INTEGER,
  closing_fils INTEGER,
  validation_ok INTEGER NOT NULL DEFAULT 0,
  validation_json TEXT NOT NULL DEFAULT '{}',
  imported_at INTEGER NOT NULL,
  UNIQUE (user_id, file_hash)
);

CREATE TABLE IF NOT EXISTS statement_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES statement_imports(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  page INTEGER NOT NULL,
  date TEXT NOT NULL,
  direction TEXT NOT NULL, -- in | out
  type TEXT NOT NULL,      -- transfer | cliq_inward | interest | tax | other
  counterparty TEXT,
  cliq_reference TEXT,
  description TEXT NOT NULL DEFAULT '',
  amount_fils INTEGER NOT NULL,
  balance_fils INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '', -- written by the user only
  UNIQUE (import_id, idx)
);

CREATE TABLE IF NOT EXISTS reconciliation_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES statement_transactions(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_fils INTEGER NOT NULL,           -- part of the transfer allocated to this order
  confidence REAL NOT NULL,               -- 0..1
  level TEXT NOT NULL,                    -- auto | suggested (what the matcher decided)
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected (what the user decided)
  reasons TEXT NOT NULL DEFAULT '',
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (transaction_id, order_id)
);
CREATE INDEX IF NOT EXISTS reconciliation_links_order ON reconciliation_links(order_id);

-- ---- Story highlights ----
-- A highlight keeps a set of your stories on your profile after they expire.
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS highlights_user ON highlights(user_id, id);

CREATE TABLE IF NOT EXISTS highlight_items (
  highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, story_id)
);

-- Per-account chat folders, inspired by Shalter's organized inbox.
CREATE TABLE IF NOT EXISTS chat_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS chat_folders_user ON chat_folders(user_id, position, id);

CREATE TABLE IF NOT EXISTS chat_folder_items (
  folder_id INTEGER NOT NULL REFERENCES chat_folders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (folder_id, conversation_id),
  UNIQUE (user_id, conversation_id, folder_id)
);
CREATE INDEX IF NOT EXISTS chat_folder_items_user ON chat_folder_items(user_id, folder_id, conversation_id);

-- Personal chat preferences (each member can choose their own wallpaper and mute timer).
CREATE TABLE IF NOT EXISTS chat_settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  wallpaper TEXT NOT NULL DEFAULT 'default',
  muted_until INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, conversation_id)
);
CREATE INDEX IF NOT EXISTS chat_settings_conversation ON chat_settings(conversation_id, user_id);
