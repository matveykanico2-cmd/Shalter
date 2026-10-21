// Схема Drizzle (schema.ts) обязана совпадать с тем, что создаёт server/db.js: и на
// свежей базе, и на старой (фикстура совместимости, обновлённая при открытии). Ловит
// колонку, добавленную в server/db.js и забытую здесь, и наоборот.
//
// server/db.js открывает cwd/data/app.db при подключении, поэтому база читается в
// отдельном процессе с cwd во временной папке.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "./schema.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const FIXTURE_DATA = path.join(REPO_ROOT, "packages", "contract-tests", "compat", "fixture");
// Ключи фикстуры совместимости (packages/contract-tests/support/env.ts).
const TEST_KEYS = {
  MESSAGES_KEY: "6d657373616765732d6b65792d666f722d636f6e74726163742d74657374732d",
  UPLOADS_KEY: "75706c6f6164732d6b65792d666f722d636f6e74726163742d74657374732d21",
};

interface Column {
  type: string;
  notNull: boolean;
  pk: boolean;
}
type Tables = Record<string, Record<string, Column>>;

const READ_SCRIPT = `
const db = require(${JSON.stringify(path.join(REPO_ROOT, "server", "db.js"))});
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'messages_search%'").pluck().all();
const out = {};
for (const t of tables) {
  out[t] = {};
  for (const c of db.prepare("SELECT * FROM pragma_table_info(?)").all(t)) {
    out[t][c.name] = { type: c.type.toLowerCase(), notNull: !!c.notnull || c.pk > 0, pk: c.pk > 0 };
  }
}
db.close();
require("fs").writeFileSync(process.env.SCHEMA_OUT, JSON.stringify(out));
`;

const tempDirs: string[] = [];
afterAll(() => tempDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function readLegacyDb(seedDataDir?: string): Tables {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-schema-"));
  tempDirs.push(dir);
  const data = path.join(dir, "data");
  if (seedDataDir) fs.cpSync(seedDataDir, data, { recursive: true });
  else fs.mkdirSync(data);
  // В файл, а не в stdout: server/db.js пишет туда свои сообщения.
  const out = path.join(dir, "schema.json");
  execFileSync(process.execPath, ["-e", READ_SCRIPT], {
    cwd: dir,
    env: { PATH: process.env.PATH, NODE_ENV: "test", SCHEMA_OUT: out, ...TEST_KEYS },
    stdio: "ignore",
  });
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

function drizzleTables(): Tables {
  const out: Tables = {};
  for (const table of Object.values(schema)) {
    if (!is(table, SQLiteTable)) continue;
    const { name, columns, primaryKeys } = getTableConfig(table);
    const composite = new Set(primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)));
    out[name] = {};
    for (const c of columns) {
      const pk = c.primary || composite.has(c.name);
      out[name][c.name] = { type: c.getSQLType(), notNull: c.notNull || pk, pk };
    }
  }
  return out;
}

describe("схема Drizzle совпадает с server/db.js", () => {
  const expected = drizzleTables();

  it("на свежей базе", () => {
    expect(readLegacyDb()).toEqual(expected);
  });

  it("на старой базе (фикстура совместимости)", () => {
    // У старой базы колонки, добавленные ALTER TABLE, стоят в другом порядке — toEqual его не учитывает.
    expect(readLegacyDb(FIXTURE_DATA)).toEqual(expected);
  });
});
