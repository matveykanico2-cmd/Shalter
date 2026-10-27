// Доступ к файлам из базы прежнего сервера (main2): там не было ни учёта загрузивших
// (upload_uploaders), ни отметок разовых переносов (data_migrations), а привязку файла к
// чату (upload_access) писала не каждая отправка (Bot API, системный чат…) — такой файл
// скачивал любой вошедший. После переезда непривязанный файл видит только загрузивший, и
// старые фото, видео и голосовые перестали открываться участникам своего же чата.
//
// Копия фикстуры приводится к виду той базы прямо в SQLite (как schema.test.ts — проверяется
// формат хранения, через API его не создать), дальше — только HTTP.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Api } from "../support/client";
import { startServer, type TestServer } from "../support/server";
import { FIXTURE_DIR, MANIFEST_PATH, download, loginOnDevice, sha256, type Manifest, type UserKey } from "./helpers";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const userOf = (k: UserKey) => manifest.users.find((u) => u.key === k)!;
const fileOf = (name: string) => manifest.files.find((f) => f.url === `/uploads/${name}`)!;

// Вложения лички alice ↔ bob, у которых в старой базе нет привязки к чату.
const UNREGISTERED = ["sha_90d3e9a597dacdbd.zip", "sha_b01667ecea238a70.ogg"];
// Файл только из отложенного сообщения bob (ещё не отправленного) — копия байтов zip.
const SCHEDULED_ONLY = "sha_00000000000000aa.zip";

describe.skipIf(!!process.env.TEST_BASE_URL)("совместимость: доступ к файлам из базы прежнего сервера", () => {
  let server: TestServer;
  let seed: string;
  const api = {} as Record<UserKey, Api>;

  beforeAll(async () => {
    seed = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-compat-access-"));
    fs.cpSync(FIXTURE_DIR, seed, { recursive: true });
    fs.copyFileSync(path.join(seed, "uploads", UNREGISTERED[0]!), path.join(seed, "uploads", SCHEDULED_ONLY));
    const db = new Database(path.join(seed, "app.db"));
    try {
      db.exec("DROP TABLE data_migrations; DELETE FROM upload_uploaders;");
      const drop = db.prepare("DELETE FROM upload_access WHERE filename = ?");
      for (const name of UNREGISTERED) drop.run(name);
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO scheduled_messages (id, chatId, senderId, text, attachments, sendAt, createdAt) VALUES (?, ?, ?, '', ?, ?, ?)"
      ).run(
        "sch_compat_old",
        manifest.chats.dm.id,
        userOf("bob").id,
        JSON.stringify([{ kind: "file", url: `/uploads/${SCHEDULED_ONLY}`, name: "позже.zip", size: 204800 }]),
        new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        now
      );
      db.pragma("wal_checkpoint(TRUNCATE)");
    } finally {
      db.close();
    }
    server = await startServer({ seedDataDir: seed });
    for (const k of ["alice", "bob", "carol"] as UserKey[]) api[k] = (await loginOnDevice(server.baseUrl, userOf(k))).api;
  });
  afterAll(async () => {
    await server?.stop();
    if (seed) fs.rmSync(seed, { recursive: true, force: true });
  });

  test("старые вложения открываются обоим участникам лички — и по Range", async () => {
    for (const name of UNREGISTERED) {
      const f = fileOf(name);
      for (const k of ["alice", "bob"] as UserKey[]) {
        const res = await download(api[k], f.url);
        expect(res.status, `${k} ${f.url}`).toBe(200);
        expect(sha256(res.bytes), `${k} ${f.url}`).toBe(f.sha256);
        const part = await download(api[k], f.url, { range: "bytes=0-99" });
        expect(part.status, `${k} ${f.url} Range`).toBe(206);
        expect(part.bytes.length).toBe(100);
      }
    }
  });

  test("постороннему старые вложения лички по-прежнему не отдаются", async () => {
    for (const name of UNREGISTERED) expect((await download(api.carol, `/uploads/${name}`)).status, name).toBe(404);
  });

  test("файл отложенного сообщения доступен его отправителю, и только ему", async () => {
    const res = await download(api.bob, `/uploads/${SCHEDULED_ONLY}`);
    expect(res.status).toBe(200);
    expect(sha256(res.bytes)).toBe(fileOf(UNREGISTERED[0]!).sha256);
    expect((await download(api.alice, `/uploads/${SCHEDULED_ONLY}`)).status).toBe(404);
    expect((await download(api.carol, `/uploads/${SCHEDULED_ONLY}`)).status).toBe(404);
  });
});
