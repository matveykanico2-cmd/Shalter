import type { reports } from "../../db/schema.js";

/** Жалоба — строка таблицы reports как есть (server/data/reports.js). */
export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
