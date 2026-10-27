// Файлы в S3 с шифрованием на стороне хранилища (S3_BUCKET + S3_SSE): в бакете лежат
// открытые байты под SSE, а /uploads/… после проверки доступа отвечает картинкам, видео и
// аудио редиректом на подписанную ссылку — файл отдаёт бакет, а не Node; остальное (текст,
// PDF, svg, неизвестные типы) по-прежнему отдаёт Node с nosniff и CSP sandbox.
// Без подтверждённого шифрования хранилища (нет S3_SSE, S3_SSE=bucket без шифрования
// бакета) файлы шифрует приложение. Плюс переезд: файлы с диска и объекты, зашифрованные
// приложением, переписываются открытыми, и адреса файлов не меняются; перешифровка не
// портит объект при сбое чтения и не путает версии, если объект подменили посреди запроса.
// Бакет — заглушка в памяти (support/s3-stub.ts).
import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { sendResult } from "../../schemas/messages";
import { uploadResult } from "../../schemas/uploads";
import { Api } from "../../support/client";
import { expectOk } from "../../support/expect";
import { createDm, registerUsers } from "../../support/seed";
import { startS3Stub, type S3Stub } from "../../support/s3-stub";
import { startServer, type TestServer } from "../../support/server";
import { download, upload, uniquePng, uniqueText } from "./helpers";

let s3: S3Stub;
const servers: TestServer[] = [];
beforeAll(async () => {
  s3 = await startS3Stub();
});
afterAll(async () => {
  for (const s of servers) await s.stop();
  await s3?.close();
});
afterEach(() => {
  s3.beforeGet = null;
  s3.bucketEncryption = null;
});

async function start(env: Record<string, string>, seedDataDir?: string): Promise<TestServer> {
  const server = await startServer({ env, seedDataDir });
  servers.push(server);
  // Каталог прежнего сервера уже скопирован в новый — убираем.
  if (seedDataDir) fs.rmSync(path.dirname(seedDataDir), { recursive: true, force: true });
  return server;
}

async function stop(server: TestServer): Promise<string> {
  servers.splice(servers.indexOf(server), 1);
  await server.stop({ keepData: true });
  return server.dataDir!;
}

/** Тот же пользователь (те же cookie) на другом сервере — после перезапуска на тех же данных. */
function sameUser(api: Api, baseUrl: string): Api {
  const moved = new Api(baseUrl);
  for (const [k, v] of api.cookies) moved.cookies.set(k, v);
  return moved;
}

const filenameOf = (url: string) => url.slice("/uploads/".length);
const keyOf = (url: string) => `shalter/${filenameOf(url)}`;

async function until(check: () => boolean, what: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`не дождались: ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const AGE = () => new Date(Date.now() - 5 * 60 * 1000);

/** Сервер с файлами, зашифрованными приложением, в бакете под prefix; данные остановленного сервера. */
async function legacyBucket(prefix: string, files: Array<{ bytes: Buffer; name: string; kind?: string }>) {
  const legacy = await start(s3.env({ S3_PREFIX: prefix, S3_AUTO_MIGRATE: "0", S3_APP_ENCRYPTION: "1" }));
  const [a] = await registerUsers(legacy.baseUrl, 1);
  const uploaded = [];
  for (const f of files) uploaded.push(expectOk(await upload(a.api, f.bytes, { kind: f.kind, name: f.name }), uploadResult));
  for (const f of uploaded) expect(s3.objects.get(`${prefix}/${filenameOf(f.url)}`)!.body.subarray(0, 6).toString()).toBe("SHENC2");
  const dataDir = await stop(legacy);
  // Перешифровка не трогает объекты моложе минуты.
  for (const [key, obj] of s3.objects) if (key.startsWith(`${prefix}/`)) obj.lastModified = AGE();
  return { a, uploaded, dataDir, key: (url: string) => `${prefix}/${filenameOf(url)}` };
}

/** Скачивание «как браузер»: /uploads/… с cookie, затем по редиректу в бакет — без них. */
async function follow(api: Api, url: string, headers: Record<string, string> = {}) {
  const first = await download(api, url);
  expect(first.status).toBe(302);
  const location = first.headers.get("location")!;
  const res = await fetch(location, { headers });
  return { first, location, res, bytes: Buffer.from(await res.arrayBuffer()) };
}

describe("S3: хранилище шифрует само, файл отдаёт бакет", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await start(s3.env({ S3_PREFIX: "shalter", S3_SSE: "AES256", S3_AUTO_MIGRATE: "0" }));
  });

  test("в бакете открытые байты под SSE; скачивание — редирект на подписанную ссылку", async () => {
    const [a, b, outsider] = await registerUsers(server.baseUrl, 3);
    const png = uniquePng();
    const file = expectOk(await upload(a.api, png, { kind: "image", name: "p.png", mimeType: "image/png" }), uploadResult);

    const obj = s3.objects.get(keyOf(file.url))!;
    expect(obj.body.equals(png)).toBe(true);
    expect(obj.metadata).toEqual({ "shalter-format": "plain" });
    expect(obj.sse).toBe("AES256");
    expect(obj.contentType).toBe("image/png");

    const { first, location, res, bytes } = await follow(a.api, file.url);
    expect(location.startsWith(`${s3.endpoint}/${s3.bucket}/${keyOf(file.url)}?`)).toBe(true);
    expect(new URL(location).searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    // Редирект браузер помнит, пока действует подпись (не больше двух часов).
    const maxAge = Number(/^private, max-age=(\d+)$/.exec(first.headers.get("cache-control") ?? "")?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(7200);
    expect(res.status).toBe(200);
    expect(bytes.equals(png)).toBe(true);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("content-disposition")).toBeNull();

    // В течение часа ссылка одна и та же — работает кэш браузера.
    expect((await download(a.api, file.url)).headers.get("location")).toBe(location);

    // Подделанная подпись — бакет отказывает.
    const forged = new URL(location);
    forged.searchParams.set("response-content-type", "text/html");
    expect((await fetch(forged)).status).toBe(403);

    // Доступ проверяет Node до редиректа: чужому — 404, без сессии — 401, ссылки нет.
    const dm = await createDm(a, b);
    for (const who of [b.api, outsider.api]) {
      const denied = await download(who, file.url);
      expect(denied.status).toBe(404);
      expect(denied.headers.get("location")).toBeNull();
    }
    const anon = await download(new Api(server.baseUrl), file.url);
    expect(anon.status).toBe(401);
    expect(anon.headers.get("location")).toBeNull();

    expectOk(
      await a.api.post(`/api/chats/${dm.id}/messages`, {
        text: "",
        attachments: [{ kind: "image", url: file.url, name: file.name, mimeType: file.mimeType, size: file.size }],
      }),
      sendResult,
    );
    expect((await follow(b.api, file.url)).bytes.equals(png)).toBe(true);
    expect((await download(outsider.api, file.url)).status).toBe(404);
  });

  test("видео: Range отдаёт бакет", async () => {
    const [a] = await registerUsers(server.baseUrl, 1);
    const video = uniqueText(5000);
    const file = expectOk(await upload(a.api, video, { kind: "video", name: "clip.mp4" }), uploadResult);
    expect(s3.objects.get(keyOf(file.url))!.body.equals(video)).toBe(true);
    const ranged = await follow(a.api, file.url, { range: "bytes=10-19" });
    expect(ranged.res.status).toBe(206);
    expect(ranged.res.headers.get("content-type")).toBe("video/mp4");
    expect(ranged.res.headers.get("content-range")).toBe(`bytes 10-19/${video.length}`);
    expect(ranged.bytes.equals(video.subarray(10, 20))).toBe(true);
  });

  test("текст в бакете открытый и несжатый, но отдаёт его Node — с nosniff и CSP sandbox, Range; одинаковые файлы — один объект", async () => {
    const [a] = await registerUsers(server.baseUrl, 1);
    const text = uniqueText(5000);
    const file = expectOk(await upload(a.api, text, { name: "notes.txt" }), uploadResult);
    const obj = s3.objects.get(keyOf(file.url))!;
    expect(obj.body.equals(text)).toBe(true);
    expect(obj.metadata).toEqual({ "shalter-format": "plain" });

    // Бакет не умеет ставить nosniff и CSP: документы, которые браузер может открыть
    // как страницу, через подписанную ссылку не отдаются.
    const full = await download(a.api, file.url);
    expect(full.status).toBe(200);
    expect(full.headers.get("location")).toBeNull();
    expect(full.bytes.equals(text)).toBe(true);
    expect(full.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
    expect(full.headers.get("content-security-policy")).toBe("sandbox");

    const ranged = await download(a.api, file.url, { headers: { range: "bytes=10-19" } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe(`bytes 10-19/${text.length}`);
    expect(ranged.bytes.equals(text.subarray(10, 20))).toBe(true);

    const count = s3.objects.size;
    const again = expectOk(await upload(a.api, text, { name: "copy.txt" }), uploadResult);
    expect(again.url).toBe(file.url);
    expect(s3.objects.size).toBe(count);
  });

  test("svg, неизвестный тип и PDF отдаёт Node с теми же заголовками, что и раньше", async () => {
    const [a] = await registerUsers(server.baseUrl, 1);
    const svgBytes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" data-x="${Date.now()}"/>`);
    const svg = expectOk(await upload(a.api, svgBytes, { name: "x.svg" }), uploadResult);
    const svgRes = await download(a.api, svg.url);
    expect(svgRes.status).toBe(200);
    expect(svgRes.bytes.equals(svgBytes)).toBe(true);
    expect(svgRes.headers.get("content-type")).toBe("image/svg+xml");
    expect(svgRes.headers.get("content-disposition")).toBe("attachment");
    expect(svgRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(svgRes.headers.get("content-security-policy")).toBe("sandbox");

    const bin = expectOk(await upload(a.api, uniqueText(), { name: "data.bin" }), uploadResult);
    const binRes = await download(a.api, bin.url);
    expect(binRes.status).toBe(200);
    expect(binRes.headers.get("content-type")).toBe("application/octet-stream");
    expect(binRes.headers.get("content-disposition")).toBe("attachment");
    expect(binRes.headers.get("content-security-policy")).toBe("sandbox");

    // PDF без песочницы: встроенный просмотрщик Chrome в ней не открывается.
    const pdf = expectOk(await upload(a.api, uniqueText(), { name: "doc.pdf" }), uploadResult);
    const pdfRes = await download(a.api, pdf.url);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("content-type")).toBe("application/pdf");
    expect(pdfRes.headers.get("content-disposition")).toBeNull();
    expect(pdfRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(pdfRes.headers.get("content-security-policy")).toBeNull();
  });
});

describe("S3: переезд на шифрование хранилища", () => {
  test("файлы с диска уходят в бакет открытыми, адреса прежние", async () => {
    const disk = await start({});
    const [a] = await registerUsers(disk.baseUrl, 1);
    const png = uniquePng();
    const text = uniqueText(5000);
    const pngFile = expectOk(await upload(a.api, png, { kind: "image", name: "p.png" }), uploadResult);
    // Текст на диске хранится сжатым — в бакет он должен уйти распакованным.
    const textFile = expectOk(await upload(a.api, text, { name: "t.txt" }), uploadResult);
    const dataDir = await stop(disk);

    // Перенос не трогает файлы моложе минуты.
    const uploadsDir = path.join(dataDir, "uploads");
    const old = new Date(Date.now() - 5 * 60 * 1000);
    for (const f of fs.readdirSync(uploadsDir)) fs.utimesSync(path.join(uploadsDir, f), old, old);

    const migrated = await start(s3.env({ S3_PREFIX: "shalter", S3_SSE: "AES256", S3_AUTO_MIGRATE: "1", S3_MIGRATE_DELAY_MS: "0" }), dataDir);
    const api = sameUser(a.api, migrated.baseUrl);
    const migratedDir = path.join(migrated.dataDir!, "uploads");
    await until(() => fs.readdirSync(migratedDir).length === 0, "файлы ушли с диска");

    for (const [file, bytes] of [
      [pngFile, png],
      [textFile, text],
    ] as const) {
      const obj = s3.objects.get(keyOf(file.url))!;
      expect(obj.metadata).toEqual({ "shalter-format": "plain" });
      expect(obj.body.equals(bytes)).toBe(true);
      const got = file === pngFile ? (await follow(api, file.url)).bytes : (await download(api, file.url)).bytes;
      expect(got.equals(bytes)).toBe(true);
    }
  });

  test("объекты, зашифрованные приложением, перешифровываются; до того их отдаёт Node", async () => {
    const env = s3.env({ S3_PREFIX: "legacy", S3_SSE: "AES256", S3_AUTO_MIGRATE: "0" });
    const legacy = await start({ ...env, S3_APP_ENCRYPTION: "1" });
    const [a] = await registerUsers(legacy.baseUrl, 1);
    const png = uniquePng();
    const text = uniqueText(5000);
    const pngFile = expectOk(await upload(a.api, png, { kind: "image", name: "p.png" }), uploadResult);
    const textFile = expectOk(await upload(a.api, text, { name: "t.txt" }), uploadResult);
    const legacyKey = (url: string) => `legacy/${filenameOf(url)}`;

    for (const [file, bytes] of [
      [pngFile, png],
      [textFile, text],
    ] as const) {
      const obj = s3.objects.get(legacyKey(file.url))!;
      expect(obj.body.subarray(0, 6).toString()).toBe("SHENC2");
      expect(obj.metadata).toEqual({});
      const got = await download(a.api, file.url);
      expect(got.status).toBe(200);
      expect(got.bytes.equals(bytes)).toBe(true);
    }
    const dataDir = await stop(legacy);

    // Перешифровка не трогает объекты моложе минуты.
    for (const [key, obj] of s3.objects) if (key.startsWith("legacy/")) obj.lastModified = new Date(Date.now() - 5 * 60 * 1000);

    // Пока не перешифрован — по-прежнему через Node.
    const before = await start(env, dataDir);
    const beforeApi = sameUser(a.api, before.baseUrl);
    const stillLegacy = await download(beforeApi, pngFile.url);
    expect(stillLegacy.status).toBe(200);
    expect(stillLegacy.bytes.equals(png)).toBe(true);
    const dataDir2 = await stop(before);

    const converted = await start({ ...env, S3_AUTO_MIGRATE: "1", S3_MIGRATE_DELAY_MS: "0" }, dataDir2);
    const api = sameUser(a.api, converted.baseUrl);
    await until(
      () => [pngFile, textFile].every((f) => s3.objects.get(legacyKey(f.url))?.metadata["shalter-format"] === "plain"),
      "объекты перешифрованы",
    );
    await until(() => fs.existsSync(path.join(converted.dataDir!, "s3-plain.done")), "отметка о завершении");
    for (const [file, bytes] of [
      [pngFile, png],
      [textFile, text],
    ] as const) {
      expect(s3.objects.get(legacyKey(file.url))!.body.equals(bytes)).toBe(true);
    }
    expect((await follow(api, pngFile.url)).bytes.equals(png)).toBe(true);
    expect((await download(api, textFile.url)).bytes.equals(text)).toBe(true);

    // S3_DIRECT_DOWNLOAD=0: открытый объект отдаёт Node, с Range.
    const dataDir3 = await stop(converted);
    const proxied = await start({ ...env, S3_DIRECT_DOWNLOAD: "0" }, dataDir3);
    const proxiedApi = sameUser(a.api, proxied.baseUrl);
    const whole = await download(proxiedApi, pngFile.url);
    expect(whole.status).toBe(200);
    expect(whole.bytes.equals(png)).toBe(true);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    const part = await download(proxiedApi, pngFile.url, { headers: { range: "bytes=0-9" } });
    expect(part.status).toBe(206);
    expect(part.bytes.equals(png.subarray(0, 10))).toBe(true);
  });

  test("сбой чтения заголовка при перешифровке — объект остаётся зашифрованным и целым, следующий проход его переводит", async () => {
    const png = uniquePng();
    const other = uniquePng();
    const { a, uploaded, dataDir, key } = await legacyBucket("hdrfail", [
      { bytes: png, name: "a.png", kind: "image" },
      { bytes: other, name: "b.png", kind: "image" },
    ]);
    const [file, otherFile] = uploaded;
    const encrypted = Buffer.from(s3.objects.get(key(file.url))!.body);

    // Первый же GET этого объекта (чтение заголовка шифрования) — ошибка бакета.
    let failed = 0;
    s3.beforeGet = (k) => {
      if (k !== key(file.url) || failed) return;
      failed += 1;
      return true;
    };
    const env = s3.env({ S3_PREFIX: "hdrfail", S3_SSE: "AES256", S3_AUTO_MIGRATE: "1", S3_MIGRATE_DELAY_MS: "0" });
    const first = await start(env, dataDir);
    await until(() => s3.objects.get(key(otherFile.url))?.metadata["shalter-format"] === "plain", "второй объект перешифрован");
    await until(() => failed === 1, "сбой случился");
    await new Promise((r) => setTimeout(r, 500));
    const kept = s3.objects.get(key(file.url))!;
    expect(kept.metadata["shalter-format"]).toBeUndefined();
    expect(kept.body.equals(encrypted)).toBe(true);
    expect(fs.existsSync(path.join(first.dataDir!, "s3-plain.done"))).toBe(false);
    // До перевода файл по-прежнему отдаёт Node, расшифрованным.
    const before = await download(sameUser(a.api, first.baseUrl), file.url);
    expect(before.status).toBe(200);
    expect(before.bytes.equals(png)).toBe(true);

    s3.beforeGet = null;
    const second = await start(env, await stop(first));
    await until(() => s3.objects.get(key(file.url))?.metadata["shalter-format"] === "plain", "объект перешифрован со второго прохода");
    expect(s3.objects.get(key(file.url))!.body.equals(png)).toBe(true);
    expect((await follow(sameUser(a.api, second.baseUrl), file.url)).bytes.equals(png)).toBe(true);
  });

  test("объект перешифровали в другом процессе — между запросами и посреди запроса отдаётся новая версия", async () => {
    const png = uniquePng();
    const png2 = uniquePng();
    const { a, uploaded, dataDir, key } = await legacyBucket("swap", [
      { bytes: png, name: "a.png", kind: "image" },
      { bytes: png2, name: "b.png", kind: "image" },
    ]);
    const [file, file2] = uploaded;
    const server = await start(s3.env({ S3_PREFIX: "swap", S3_SSE: "AES256", S3_AUTO_MIGRATE: "0" }), dataDir);
    const api = sameUser(a.api, server.baseUrl);
    const asPlain = (bytes: Buffer) => ({ body: bytes, contentType: "image/png", metadata: { "shalter-format": "plain" }, sse: "AES256", lastModified: new Date() });

    // Между запросами: прежний размер зашифрованного объекта не запоминается.
    const legacyRes = await download(api, file.url);
    expect(legacyRes.status).toBe(200);
    expect(legacyRes.bytes.equals(png)).toBe(true);
    s3.objects.set(key(file.url), asPlain(png));
    expect((await follow(api, file.url)).bytes.equals(png)).toBe(true);

    // Посреди запроса: после HEAD (ещё зашифрован) объект подменяют, чтение по старому
    // ETag получает 412 — и сервер отвечает уже по новой версии, а не смесью двух.
    let swapped = false;
    s3.beforeGet = (k) => {
      if (k !== key(file2.url) || swapped) return;
      swapped = true;
      s3.objects.set(key(file2.url), asPlain(png2));
    };
    const res = await follow(api, file2.url);
    expect(swapped).toBe(true);
    expect(res.bytes.equals(png2)).toBe(true);
  });
});

describe("S3: шифрование хранилища не подтверждено — файлы шифрует приложение", () => {
  test("без S3_SSE в бакет идут зашифрованные приложением байты, отдаёт Node; перешифровки нет", async () => {
    const server = await start(s3.env({ S3_PREFIX: "nosse", S3_AUTO_MIGRATE: "1", S3_MIGRATE_DELAY_MS: "0" }));
    const [a] = await registerUsers(server.baseUrl, 1);
    const png = uniquePng();
    const file = expectOk(await upload(a.api, png, { kind: "image", name: "p.png" }), uploadResult);
    const obj = s3.objects.get(`nosse/${filenameOf(file.url)}`)!;
    expect(obj.body.subarray(0, 6).toString()).toBe("SHENC2");
    expect(obj.metadata).toEqual({});
    const got = await download(a.api, file.url);
    expect(got.status).toBe(200);
    expect(got.bytes.equals(png)).toBe(true);
    expect(server.log()).toContain("S3_SSE не задан");
    await new Promise((r) => setTimeout(r, 300));
    expect(s3.objects.get(`nosse/${filenameOf(file.url)}`)!.metadata).toEqual({});
  });

  test("S3_SSE=bucket: бакет без шифрования — пишет и шифрует приложение, старые объекты не трогаются; с шифрованием — открытые", async () => {
    const png = uniquePng();
    const { a, uploaded, dataDir, key } = await legacyBucket("bucketsse", [{ bytes: png, name: "old.png", kind: "image" }]);
    const [old] = uploaded;
    const env = s3.env({ S3_PREFIX: "bucketsse", S3_SSE: "bucket", S3_AUTO_MIGRATE: "1", S3_MIGRATE_DELAY_MS: "0" });

    const unencrypted = await start(env, dataDir);
    const api = sameUser(a.api, unencrypted.baseUrl);
    const fresh = uniquePng();
    const file = expectOk(await upload(api, fresh, { kind: "image", name: "new.png" }), uploadResult);
    expect(s3.objects.get(key(file.url))!.body.subarray(0, 6).toString()).toBe("SHENC2");
    await until(() => unencrypted.log().includes("Перешифровка бакета отменена"), "перешифровка отказалась");
    expect(s3.objects.get(key(old.url))!.metadata).toEqual({});
    expect((await download(api, file.url)).bytes.equals(fresh)).toBe(true);

    s3.bucketEncryption = "aws:kms";
    const encrypted = await start(env, await stop(unencrypted));
    const api2 = sameUser(a.api, encrypted.baseUrl);
    const fresh2 = uniquePng();
    const file2 = expectOk(await upload(api2, fresh2, { kind: "image", name: "new2.png" }), uploadResult);
    expect(s3.objects.get(key(file2.url))!.metadata).toEqual({ "shalter-format": "plain" });
    // S3_SSE=bucket: заголовок шифрования с файлом не передаётся — шифрует бакет.
    expect(s3.objects.get(key(file2.url))!.sse).toBeUndefined();
    await until(() => s3.objects.get(key(old.url))?.metadata["shalter-format"] === "plain", "старый объект перешифрован");
    expect((await follow(api2, old.url)).bytes.equals(png)).toBe(true);
    expect((await follow(api2, file2.url)).bytes.equals(fresh2)).toBe(true);
  });
});
