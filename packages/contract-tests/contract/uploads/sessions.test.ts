// Загрузка частями с продолжением после обрыва: /api/uploads/sessions. Части принимаются
// строго по порядку (offset = принятое), обрыв не начинает файл заново, завершение отдаёт
// тот же ответ, что POST /api/uploads, и файл скачивается байт в байт.
import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { uploadResult, uploadSession, uploadSessionChunk } from "../../schemas/uploads";
import type { Api } from "../../support/client";
import { expectError, expectOk } from "../../support/expect";
import { registerUsers } from "../../support/seed";
import { useServer } from "../../support/use-server";
import { download } from "./helpers";

const server = useServer();

const put = (api: Api, id: string, offset: number, bytes: Uint8Array) =>
  api.request("PUT", `/api/uploads/sessions/${id}`, { query: { offset }, headers: { "content-type": "application/octet-stream" }, body: new Blob([new Uint8Array(bytes)]) });

describe("/api/uploads/sessions", () => {
  test("файл частями: сколько принято, повтор с неверного места — 409 с received, завершение — файл байт в байт", async () => {
    const [a] = await registerUsers(server().baseUrl, 1);
    const bytes = randomBytes(300_000);
    const created = expectOk(await a.api.post("/api/uploads/sessions", undefined, { query: { kind: "file", name: "big.bin", size: bytes.length } }), uploadSession);
    expect(created).toMatchObject({ received: 0, size: bytes.length });
    const { id } = created;

    expect(expectOk(await put(a.api, id, 0, bytes.subarray(0, 100_000)), uploadSessionChunk).received).toBe(100_000);
    // Клиент «потерял» ответ и шлёт ту же часть снова — сервер говорит, сколько у него есть.
    const again = await put(a.api, id, 0, bytes.subarray(0, 100_000));
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ received: 100_000 });
    expect(expectOk(await a.api.get(`/api/uploads/sessions/${id}`), uploadSession).received).toBe(100_000);
    // Не всё пришло — не завершить.
    expectError(await a.api.post(`/api/uploads/sessions/${id}/complete`), 409, "Файл загружен не полностью");

    // Части не кратны 16 байтам — шифрование частей стыкуется.
    expectOk(await put(a.api, id, 100_000, bytes.subarray(100_000, 200_007)), uploadSessionChunk);
    expectOk(await put(a.api, id, 200_007, bytes.subarray(200_007)), uploadSessionChunk);
    const done = expectOk(await a.api.post(`/api/uploads/sessions/${id}/complete`), uploadResult);
    expect(done).toMatchObject({ name: "big.bin", size: bytes.length, kind: "file" });
    const file = await download(a.api, done.url);
    expect(file.status).toBe(200);
    expect(file.bytes.equals(bytes)).toBe(true);
    // Сессия закрыта.
    expectError(await a.api.get(`/api/uploads/sessions/${id}`), 404, "Загрузка не найдена — начните заново");
  });

  test("чужая сессия — 404; больше лимита вида или больше заявленного — 413; отмена", async () => {
    const [a, b] = await registerUsers(server().baseUrl, 2);
    const { id } = expectOk(await a.api.post("/api/uploads/sessions", undefined, { query: { kind: "file", name: "x.bin", size: 10 } }), uploadSession);
    expectError(await b.api.get(`/api/uploads/sessions/${id}`), 404, "Загрузка не найдена — начните заново");
    expectError(await put(b.api, id, 0, randomBytes(10)), 404, "Загрузка не найдена — начните заново");
    expectError(await put(a.api, id, 0, randomBytes(11)), 413, "Слишком большая часть");
    expectError(await a.api.post("/api/uploads/sessions", undefined, { query: { kind: "avatar", name: "a.png", size: 21 * 1024 * 1024 } }), 413);
    expect((await a.api.delete(`/api/uploads/sessions/${id}`)).status).toBe(200);
    expectError(await a.api.get(`/api/uploads/sessions/${id}`), 404, "Загрузка не найдена — начните заново");
  });

  test("без сессии входа — 401", async () => {
    const { Api: Client } = await import("../../support/client");
    const anon = new Client(server().baseUrl);
    expectError(await anon.post("/api/uploads/sessions", undefined, { query: { kind: "file", name: "x", size: 1 } }), 401, "unauthorized");
  });
});
