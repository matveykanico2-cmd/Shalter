// drizzle-kit только читает базу: `npx drizzle-kit pull` (сверить схему) и
// `npx drizzle-kit studio`. Схемой владеет server/db.js — `generate`/`migrate`/`push`
// здесь не запускать, пока server/ не удалён.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  dbCredentials: { url: process.env.DRIZZLE_DB ?? "../../data/app.db" },
  out: process.env.DRIZZLE_OUT ?? "./drizzle",
  // Поисковый указатель FTS5 (виртуальная таблица и её служебные) ведёт server/db.js.
  tablesFilter: ["!messages_search*", "!sqlite_*"],
});
