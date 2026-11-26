// Brings a database up to the current schema. Safe to run on every start:
// tables are CREATE IF NOT EXISTS, and columns added after the first release are added only if missing.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureWelcomeMessages } from "./welcome.mjs";

// Scripts, tests and the Next.js server all run from the project root.
const SCHEMA = path.join(process.cwd(), "db", "schema.sql");

/** The database file: $SNAPGRAM_DB if set (tests use a temp file), else data/snapgram.db. */
export function databasePath() {
  return process.env.SNAPGRAM_DB || path.join(process.cwd(), "data", "snapgram.db");
}

/** Opens (creating if needed) and migrates the database. */
export function openDatabase(file = databasePath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

/** [table, column, definition] — columns added to tables that already existed. */
const ADDED_COLUMNS = [
  ["users", "is_business", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "phone", "TEXT"],
  ["users", "last_name", "TEXT NOT NULL DEFAULT ''"],
  ["users", "email_verified_at", "INTEGER"],
  ["users", "business_category", "TEXT NOT NULL DEFAULT ''"],
  ["users", "is_seed", "INTEGER NOT NULL DEFAULT 0"],
  // Followers/following brought over from another platform (e.g. an Instagram page); added to the real counts.
  ["users", "imported_follower_count", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "imported_following_count", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "private_account", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "show_activity", "INTEGER NOT NULL DEFAULT 1"],
  ["users", "allow_messages", "INTEGER NOT NULL DEFAULT 1"],
  ["conversations", "is_seed", "INTEGER NOT NULL DEFAULT 0"],
  ["conversations", "kind", "TEXT NOT NULL DEFAULT 'direct'"],
  ["conversations", "title", "TEXT"],
  ["conversations", "owner_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"],
  ["conversations", "linked_conversation_id", "INTEGER REFERENCES conversations(id) ON DELETE SET NULL"],
  ["conversations", "theme", "TEXT NOT NULL DEFAULT 'default'"],
  ["conversation_members", "role", "TEXT NOT NULL DEFAULT 'member'"],
  ["messages", "kind", "TEXT NOT NULL DEFAULT 'text'"], // text | post | voice | invoice | receipt | welcome
  ["messages", "invoice_id", "INTEGER REFERENCES invoices(id) ON DELETE SET NULL"],
  ["messages", "voice_seconds", "INTEGER"],
  ["messages", "media_url", "TEXT"],
  ["messages", "media_kind", "TEXT"],
  ["messages", "voice_url", "TEXT"],
  ["messages", "call_type", "TEXT"],
  ["messages", "call_status", "TEXT"],
  ["messages", "gift_id", "INTEGER REFERENCES gift_catalog(id) ON DELETE SET NULL"],
  ["messages", "gift_name", "TEXT"],
  ["messages", "gift_emoji", "TEXT"],
  ["messages", "gift_price", "INTEGER"],
  ["messages", "poll_question", "TEXT"],
  ["messages", "poll_options", "TEXT"],
  ["messages", "poll_votes", "TEXT"],
  ["messages", "reply_to_id", "INTEGER REFERENCES messages(id) ON DELETE SET NULL"],
  ["messages", "edited_at", "INTEGER"],
  ["messages", "pinned_at", "INTEGER"],
  ["messages", "pinned_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL"],
  ["messages", "is_seed", "INTEGER NOT NULL DEFAULT 0"],
  // Custom highlight cover; NULL means use the first story.
  ["highlights", "cover_url", "TEXT"],
];

/** @param {DatabaseSync} db */
export function migrate(db) {
  db.exec(fs.readFileSync(SCHEMA, "utf8"));
  for (const [table, column, def] of ADDED_COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
  // Messages saved before `kind` existed: shared posts were plain rows with a post_id.
  db.exec("UPDATE messages SET kind = 'post' WHERE post_id IS NOT NULL AND kind = 'text'");
  // The local demo account is the owner/admin account used by the development app.
  db.prepare("UPDATE users SET phone = ? WHERE username = 'demo' AND (phone IS NULL OR phone = '')").run("+797819827502");
  db.exec(`
    CREATE INDEX IF NOT EXISTS users_seed ON users(is_seed) WHERE is_seed = 1;
    CREATE INDEX IF NOT EXISTS messages_seed ON messages(is_seed) WHERE is_seed = 1;
    CREATE INDEX IF NOT EXISTS chat_folder_items_user ON chat_folder_items(user_id, folder_id, conversation_id);
  `);
  ensureWelcomeMessages(db);
}
