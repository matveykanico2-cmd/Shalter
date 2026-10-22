import { Global, Inject, Module } from "@nestjs/common";
import type BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { legacyConnection } from "../../legacy/legacy.js";
import * as schema from "./schema.js";

export const DB = Symbol("DB");
/** $client — само подключение, для запросов, которых нет в Drizzle (итератор по строкам). */
export type Db = BetterSQLite3Database<typeof schema> & { $client: BetterSqlite3.Database };

/** Внедрение базы в репозиторий: `constructor(@InjectDb() private readonly db: Db)`. */
export const InjectDb = () => Inject(DB);

// Запросы синхронные, как у better-sqlite3 в server/data/*.js: .all(), .get(), .run().
@Global()
@Module({
  providers: [{ provide: DB, useFactory: (): Db => drizzle({ client: legacyConnection(), schema }) }],
  exports: [DB],
})
export class DbModule {}
