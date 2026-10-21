import { Global, Inject, Module } from "@nestjs/common";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { legacyConnection } from "../legacy.js";
import * as schema from "./schema.js";

export const DB = Symbol("DB");
export type Db = BetterSQLite3Database<typeof schema>;

/** Внедрение базы в репозиторий: `constructor(@InjectDb() private readonly db: Db)`. */
export const InjectDb = () => Inject(DB);

// Запросы синхронные, как у better-sqlite3 в server/data/*.js: .all(), .get(), .run().
@Global()
@Module({
  providers: [{ provide: DB, useFactory: (): Db => drizzle({ client: legacyConnection(), schema }) }],
  exports: [DB],
})
export class DbModule {}
