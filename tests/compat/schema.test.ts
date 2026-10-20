// Схема базы фикстуры = схема, которую создаёт текущий сервер на пустом каталоге.
//
// Это единственное место в tests/, где SQLite открывается напрямую (better-sqlite3),
// в обход API. Иначе нельзя: проверяется сам формат хранения — что новая реализация
// создаёт те же таблицы и колонки (иначе старая база у неё не откроется или потеряет
// поля), и что в файлах на диске нет открытого текста. Через API этого не увидеть.
// Базы открываются только на чтение и только копии: фикстура не меняется.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startServer, type TestServer } from "../support/server";
import { FIXTURE_DIR, MANIFEST_PATH, type Manifest } from "./helpers";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

interface Schema {
  userVersion: number;
  tables: Record<string, Array<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number; hidden: number }>>;
  indexes: Record<string, { table: string; unique: number; columns: string[] }>;
  triggers: string[];
}

/** Таблицы, колонки (по имени — порядок колонок для чтения по имени не важен), индексы, триггеры. */
function readSchema(file: string): Schema {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const objects = db.prepare("SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ type: string; name: string; tbl_name: string }>;
    const schema: Schema = { userVersion: db.pragma("user_version", { simple: true }), tables: {}, indexes: {}, triggers: [] };
    for (const o of objects) {
      if (o.type === "table") {
        schema.tables[o.name] = (db.prepare(`PRAGMA table_xinfo("${o.name}")`).all() as any[])
          .map(({ name, type, notnull, dflt_value, pk, hidden }) => ({ name, type, notnull, dflt_value, pk, hidden }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } else if (o.type === "index") {
        const info = (db.prepare(`PRAGMA index_list("${o.tbl_name}")`).all() as any[]).find((i) => i.name === o.name);
        const columns = (db.prepare(`PRAGMA index_info("${o.name}")`).all() as any[]).map((c) => c.name);
        schema.indexes[o.name] = { table: o.tbl_name, unique: info?.unique ?? 0, columns };
      } else if (o.type === "trigger") {
        schema.triggers.push(o.name);
      }
    }
    return schema;
  } finally {
    db.close();
  }
}

describe.skipIf(!!process.env.TEST_BASE_URL)("совместимость: схема и формат хранения", () => {
  let fresh: TestServer;
  let tmp: string;

  beforeAll(async () => {
    fresh = await startServer();
    // Копия фикстуры: открытие WAL-базы создаёт рядом -shm, саму фикстуру не трогаем.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-compat-schema-"));
    fs.copyFileSync(path.join(FIXTURE_DIR, "app.db"), path.join(tmp, "app.db"));
  });
  afterAll(async () => {
    await fresh?.stop();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("в фикстуре нет висящего -wal: всё лежит в app.db", () => {
    expect(fs.existsSync(path.join(FIXTURE_DIR, "app.db-wal"))).toBe(false);
    expect(fs.existsSync(path.join(FIXTURE_DIR, "app.db-shm"))).toBe(false);
  });

  test("таблицы, колонки, индексы и триггеры как у свежей базы текущего сервера", () => {
    const want = readSchema(path.join(fresh.dataDir!, "app.db"));
    const got = readSchema(path.join(tmp, "app.db"));
    for (const t of ["users", "chats", "chat_members", "messages", "messages_search", "crypto_keys", "upload_access"]) expect(want.tables, t).toHaveProperty(t);
    expect(Object.keys(got.tables).sort()).toEqual(Object.keys(want.tables).sort());
    for (const name of Object.keys(want.tables)) expect(got.tables[name], `колонки ${name}`).toEqual(want.tables[name]);
    expect(got.indexes).toEqual(want.indexes);
    expect(got.triggers.sort()).toEqual(want.triggers.sort());
    expect(got.userVersion).toBe(want.userVersion);
  });

  test("тексты и файлы на диске зашифрованы: открытого текста нет", () => {
    const db = fs.readFileSync(path.join(FIXTURE_DIR, "app.db"));
    for (const [key, m] of Object.entries(manifest.messages)) {
      // Короткие и пустые тексты могут случайно совпасть с чем-то служебным — берём осмысленные.
      if (m.text.length < 8) continue;
      expect(db.includes(Buffer.from(m.text.slice(0, 24), "utf8")), `${key}: текст лежит открыто`).toBe(false);
      if (m.originalText) expect(db.includes(Buffer.from(m.originalText.slice(0, 24), "utf8")), `${key}: старый текст`).toBe(false);
    }
    expect(db.includes(Buffer.from("Расшифровка голосового", "utf8"))).toBe(false);
    const uploads = path.join(FIXTURE_DIR, "uploads");
    for (const f of fs.readdirSync(uploads)) {
      const raw = fs.readFileSync(path.join(uploads, f));
      expect(raw.subarray(0, 6).toString(), f).toBe("SHENC2");
    }
  });
});
