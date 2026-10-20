// Файлы: POST /api/uploads, GET /api/uploads/limits и отдача GET/HEAD /uploads/:filename
// (доступ по участию в чате, Range, сжатые файлы). На диске файлы зашифрованы —
// тест видит только то, что видит клиент: байты на выходе равны байтам на входе.
import { afterAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { historyPage, sendResult, wsMessageUpdated } from "../../schemas/messages";
import { uploadLimits, uploadResult } from "../../schemas/uploads";
import { Api } from "../../support/client";
import { expectError, expectOk, expectShape } from "../../support/expect";
import { createDm, createGroup, registerUsers, sendText } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { connectWs, type WsClient } from "../../support/ws";
import { download, upload, uniquePng, uniqueText } from "./helpers";

const server = useServer();
const sockets: WsClient[] = [];
afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
});

const msgs = (chatId: string) => `/api/chats/${chatId}/messages`;
const GB = 1024 ** 3;
const MB = 1024 ** 2;

describe("GET /api/uploads/limits", () => {
  test("лимиты по видам файлов", async () => {
    const { baseUrl } = server();
    const [a] = await registerUsers(baseUrl, 1);
    const body = expectOk(await a.api.get("/api/uploads/limits"), uploadLimits);
    expect(body).toEqual({
      limits: {
        video: 5 * GB,
        image: 5 * GB,
        file: 5 * GB,
        voice: 5 * GB,
        "video-note": 5 * GB,
        avatar: 20 * MB,
        "avatar-video": 3 * GB,
        gift: 20 * MB,
        "profile-track": 5 * GB,
      },
      defaultLimit: 1 * GB,
    });
    expectError(await new Api(baseUrl).get("/api/uploads/limits"), 401, "unauthorized");
  });
});

describe("POST /api/uploads", () => {
  test("тело — сырые байты; имя, вид и тип — в query; одинаковые файлы хранятся один раз", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const png = uniquePng();
    const res = expectOk(await upload(a.api, png, { kind: "image", name: "фото.PNG", mimeType: "image/png" }), uploadResult);
    expect(res).toEqual({ url: expect.stringMatching(/^\/uploads\/sha_[a-f0-9]{16}\.png$/), name: "фото.PNG", size: png.length, mimeType: "image/png", kind: "image" });

    // Тот же файл другим пользователем — тот же адрес.
    const again = expectOk(await upload(b.api, png, { kind: "image", name: "copy.png" }), uploadResult);
    expect(again.url).toBe(res.url);
    expect(again).not.toHaveProperty("mimeType");
  });

  test("по умолчанию kind=file и name=file (без расширения); небезопасное расширение отбрасывается", async () => {
    const { baseUrl } = server();
    const [a] = await registerUsers(baseUrl, 1);
    const def = expectOk(await upload(a.api, uniqueText()), uploadResult);
    expect(def).toMatchObject({ name: "file", kind: "file", url: expect.stringMatching(/^\/uploads\/sha_[a-f0-9]{16}$/) });
    const odd = expectOk(await upload(a.api, uniqueText(), { name: "evil.ph$p" }), uploadResult);
    expect(odd.url).toMatch(/^\/uploads\/sha_[a-f0-9]{16}$/);
    const long = expectOk(await upload(a.api, uniqueText(), { name: "x".repeat(400) + ".txt" }), uploadResult);
    expect(long.name).toHaveLength(300);
    // Расширение берётся из уже обрезанного до 300 символов имени — .txt потерялось.
    expect(long.url).toMatch(/^\/uploads\/sha_[a-f0-9]{16}$/);
  });

  test("ошибки: неизвестный вид, пустой файл, без сессии", async () => {
    const { baseUrl } = server();
    const [a] = await registerUsers(baseUrl, 1);
    expectError(await upload(a.api, uniqueText(), { kind: "exe" }), 400, "Неизвестный тип файла");
    expectError(await upload(a.api, new Uint8Array(0)), 400, "Пустой файл");
    expectError(await upload(new Api(baseUrl), uniqueText()), 401, "unauthorized");
  });
});

describe("GET/HEAD /uploads/:filename", () => {
  test("доступ: участники чата — да, посторонние — 404, без сессии — 401", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const png = uniquePng();
    const file = expectOk(await upload(a.api, png, { kind: "image", name: "p.png", mimeType: "image/png" }), uploadResult);

    // Пока файл не прикреплён ни к одному чату, его скачивает только загрузивший.
    expect((await download(a.api, file.url)).status).toBe(200);
    expect((await download(b.api, file.url)).status).toBe(404);
    expect((await download(outsider.api, file.url)).status).toBe(404);

    const sent = expectOk(
      await a.api.post(msgs(dm.id), {
        text: "",
        attachments: [{ kind: "image", url: file.url, thumbUrl: file.url, name: file.name, mimeType: file.mimeType, size: file.size }],
      }),
      sendResult,
    ).message;
    expect(sent.attachments).toEqual([{ kind: "image", url: file.url, thumbUrl: file.url, name: "p.png", mimeType: "image/png", size: png.length }]);

    const got = await download(b.api, file.url);
    expect(got.status).toBe(200);
    expect(got.bytes.equals(png)).toBe(true);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(got.headers.get("content-length")).toBe(String(png.length));
    expect(got.headers.get("accept-ranges")).toBe("bytes");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(got.headers.get("content-security-policy")).toBe("sandbox");
    expect(got.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(got.headers.get("content-disposition")).toBeNull();

    const out = await download(outsider.api, file.url);
    expect(out.status).toBe(404);
    expect(JSON.parse(out.bytes.toString())).toEqual({ error: "not found" });
    const anon = await download(new Api(baseUrl), file.url);
    expect(anon.status).toBe(401);
    expect(JSON.parse(anon.bytes.toString())).toEqual({ error: "unauthorized" });

    // HEAD — те же заголовки без тела.
    const head = await download(b.api, file.url, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(png.length));
    expect(head.bytes.length).toBe(0);
    expect((await download(outsider.api, file.url, { method: "HEAD" })).status).toBe(404);
    expect((await download(new Api(baseUrl), file.url, { method: "HEAD" })).status).toBe(401);
  });

  test("Range: 206 + Content-Range; суффикс, открытый конец, 416 вне файла", async () => {
    const { baseUrl } = server();
    const [a] = await registerUsers(baseUrl, 1);
    const png = uniquePng();
    const { url } = expectOk(await upload(a.api, png, { kind: "image", name: "r.png" }), uploadResult);
    const size = png.length;
    const range = (r: string, method = "GET") => download(a.api, url, { method, headers: { range: r } });

    let res = await range("bytes=0-7");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-7/${size}`);
    expect(res.headers.get("content-length")).toBe("8");
    expect(res.bytes.equals(png.subarray(0, 8))).toBe(true);

    res = await range("bytes=10-");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 10-${size - 1}/${size}`);
    expect(res.bytes.equals(png.subarray(10))).toBe(true);

    res = await range("bytes=-5");
    expect(res.headers.get("content-range")).toBe(`bytes ${size - 5}-${size - 1}/${size}`);
    expect(res.bytes.equals(png.subarray(size - 5))).toBe(true);

    // Конец за пределами файла подрезается.
    res = await range(`bytes=${size - 2}-${size + 100}`);
    expect(res.status).toBe(206);
    expect(res.bytes.equals(png.subarray(size - 2))).toBe(true);

    res = await range(`bytes=${size}-`);
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe(`bytes */${size}`);
    expect((await range("bytes=5-2")).status).toBe(416);

    // Непонятный Range игнорируется — весь файл.
    res = await range("items=0-1");
    expect(res.status).toBe(200);
    expect(res.bytes.equals(png)).toBe(true);

    res = await range("bytes=0-3", "HEAD");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-3/${size}`);
    expect(res.bytes.length).toBe(0);
  });

  test("обычный файл хранится сжатым: тип по расширению, Range не поддерживается", async () => {
    const { baseUrl } = server();
    const [a] = await registerUsers(baseUrl, 1);
    const text = uniqueText(5000);
    const file = expectOk(await upload(a.api, text, { name: "notes.txt" }), uploadResult);
    expect(file.size).toBe(text.length);

    const got = await download(a.api, file.url);
    expect(got.status).toBe(200);
    expect(got.bytes.equals(text)).toBe(true);
    expect(got.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(got.headers.get("accept-ranges")).toBe("none");

    const ranged = await download(a.api, file.url, { headers: { range: "bytes=0-9" } });
    expect(ranged.status).toBe(200);
    expect(ranged.bytes.equals(text)).toBe(true);

    // Неизвестное расширение — octet-stream и скачивание, а не показ.
    const bin = expectOk(await upload(a.api, uniqueText(), { name: "data.bin" }), uploadResult);
    const binRes = await download(a.api, bin.url);
    expect(binRes.headers.get("content-type")).toBe("application/octet-stream");
    expect(binRes.headers.get("content-disposition")).toBe("attachment");
  });

  test("неверное имя файла — 404 без тела; несуществующий — 404 как у чужого", async () => {
    const { baseUrl } = server();
    const [a] = await registerUsers(baseUrl, 1);
    for (const name of ["../../etc/passwd", "BAD_NAME.png", "sha_xyz"]) {
      const res = await download(a.api, `/uploads/${encodeURIComponent(name)}`);
      expect(res.status, name).toBe(404);
      expect(res.bytes.length, name).toBe(0);
    }
    // Несуществующий файл неотличим от чужого: не выдаём, есть ли такой.
    const missing = await download(a.api, "/uploads/sha_0000000000000000.png");
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.bytes.toString())).toEqual({ error: "not found" });
  });

  test("чужой неприкреплённый файл, прикреплённый к своему чату, доступа не даёт", async () => {
    const { baseUrl } = server();
    const [victim, a, b] = await registerUsers(baseUrl, 3);
    const file = expectOk(await upload(victim.api, uniqueText(), { name: "secret.txt" }), uploadResult);
    const dm = await createDm(a, b);
    await sendText(a, dm.id, "чужое", { attachments: [{ kind: "file", url: file.url, name: "secret.txt" }] });
    expect((await download(a.api, file.url)).status).toBe(404);
    expect((await download(b.api, file.url)).status).toBe(404);
    expect((await download(victim.api, file.url)).status).toBe(200);
  });

  test("после удаления сообщения у всех файл доступен только загрузившему", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const group = await createGroup(a, [b]);
    const text = uniqueText();
    const file = expectOk(await upload(a.api, text, { name: "doc.txt" }), uploadResult);
    const sent = await sendText(a, group.id, "файл", { attachments: [{ kind: "file", url: file.url, name: "doc.txt" }] });
    expect((await download(b.api, file.url)).status).toBe(200);

    expectOk(await a.api.delete(msgs(group.id) + `/${sent.id}`, { forEveryone: true }), z.unknown());
    // Доступ участников снимается; сам файл остаётся у загрузившего (уберёт orphanSweep).
    expect((await download(b.api, file.url)).status).toBe(404);
    expect((await download(outsider.api, file.url)).status).toBe(404);
    const own = await download(a.api, file.url);
    expect(own.status).toBe(200);
    expect(own.bytes.equals(text)).toBe(true);
  });
});

describe("вложения в сообщениях", () => {
  test("фото без превью: previewPending, затем message:updated всем участникам", async () => {
    const { baseUrl } = server();
    const [a, b, outsider] = await registerUsers(baseUrl, 3);
    const dm = await createDm(a, b);
    const [aWs, bWs] = await Promise.all([connectWs(a.api), connectWs(b.api)]);
    sockets.push(aWs, bWs);
    const file = expectOk(await upload(a.api, uniquePng(), { kind: "image", name: "x.png" }), uploadResult);
    const sent = await sendText(a, dm.id, "", { attachments: [{ kind: "image", url: file.url }] });
    expect(sent.attachments).toEqual([{ kind: "image", url: file.url, previewPending: true }]);

    for (const sock of [aWs, bWs]) {
      const ev = await sock.waitFor("message:updated", (e) => e.message?.id === sent.id, 15_000);
      expectShape(wsMessageUpdated, ev);
      expect(ev.message.attachments[0]).not.toHaveProperty("previewPending");
      // Превью картинки — отдельный файл; thumbUrl и previewUrl совпадают.
      expect(ev.message.attachments[0]).toEqual({
        kind: "image",
        url: file.url,
        previewUrl: expect.stringMatching(/^\/uploads\//),
        thumbUrl: ev.message.attachments[0].previewUrl,
      });
    }
    const preview = (await bWs.waitFor("message:updated", (e) => e.message?.id === sent.id)).message.attachments[0].previewUrl;
    // Превью зарегистрировано за чатом: участнику — да, постороннему — нет.
    expect((await download(b.api, preview)).status).toBe(200);
    expect((await download(outsider.api, preview)).status).toBe(404);
    const history = expectOk(await b.api.get(msgs(dm.id)), historyPage);
    expect(history.messages[0].attachments?.[0]).not.toHaveProperty("previewPending");
  });

  test("небезопасные адреса и неизвестные виды вложений отбрасываются", async () => {
    const { baseUrl } = server();
    const [a, b] = await registerUsers(baseUrl, 2);
    const dm = await createDm(a, b);
    const file = expectOk(await upload(a.api, uniqueText(), { name: "ok.txt" }), uploadResult);
    const sent = await sendText(a, dm.id, "смесь", {
      attachments: [
        { kind: "file", url: "javascript:alert(1)" },
        { kind: "file", url: "/uploads/../secret" },
        { kind: "script", url: file.url },
        { kind: "file", url: file.url, name: "ok.txt", size: "big", extra: "x" },
      ],
    });
    expect(sent.attachments).toEqual([{ kind: "file", url: file.url, name: "ok.txt" }]);
  });
});
