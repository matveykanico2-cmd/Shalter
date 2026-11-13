import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeXhr, fakeXhr } from "../lib/test";

import { CHUNKED_FROM, UPLOAD_CANCELLED, uploadFile, type UploadSessionRef } from "./upload";

const file = (name = "a.png", type = "image/png") => new File(["x"], name, { type });

beforeEach(() => fakeXhr());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const next = () => vi.waitFor(() => expect(FakeXhr.requests.at(-1)).toBeTruthy()).then(() => FakeXhr.requests.at(-1)!);

describe("загрузка файла (как public/js/lib/upload.js)", () => {
  it("тело — сам файл, вид и имя — в адресе; прогресс; ответ сервера", async () => {
    const progress: number[] = [];
    const done = uploadFile(file("Фото.png"), "image", { onProgress: (p) => progress.push(p) });
    const xhr = await next();
    expect(xhr.method).toBe("POST");
    expect(xhr.params).toEqual({ kind: "image", name: "Фото.png", mimeType: "image/png" });
    xhr.progress(50, 100);
    xhr.respond(200, { url: "/uploads/sha_1.png", name: "Фото.png", size: 1, mimeType: "image/png" });
    await expect(done).resolves.toEqual({ kind: "image", url: "/uploads/sha_1.png", name: "Фото.png", size: 1, mimeType: "image/png" });
    expect(progress).toEqual([0.5]);
  });

  it("503 — повтор через секунду; 413 — понятная ошибка без повтора", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const done = uploadFile(file(), "image");
    (await next()).respond(503, {});
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(FakeXhr.requests).toHaveLength(2));
    FakeXhr.requests[1]!.respond(200, { url: "/uploads/ok" });
    await expect(done).resolves.toMatchObject({ url: "/uploads/ok" });

    const big = uploadFile(file(), "file");
    await vi.waitFor(() => expect(FakeXhr.requests).toHaveLength(3));
    FakeXhr.requests[2]!.respond(413, {});
    await expect(big).rejects.toThrow("Файл слишком большой для сервера");
  });

  it("отмена обрывает запрос", async () => {
    const controller = new AbortController();
    const done = uploadFile(file(), "image", { signal: controller.signal });
    const xhr = await next();
    controller.abort();
    await expect(done).rejects.toThrow(UPLOAD_CANCELLED);
    expect(xhr.aborted).toBe(true);
  });

  it("большой файл — частями: обрыв повторяет только оборванную часть, 409 продолжает с принятого, завершение — ответ загрузки", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const big = new File([new Uint8Array(CHUNKED_FROM + 10)], "clip.mp4", { type: "video/mp4" });
    const session: UploadSessionRef = {};
    const progress: number[] = [];
    const done = uploadFile(big, "video", { session, onProgress: (p) => progress.push(p) });
    const at = (n: number) => vi.waitFor(() => expect(FakeXhr.requests).toHaveLength(n)).then(() => FakeXhr.requests[n - 1]!);

    const create = await at(1);
    expect([create.method, create.params.size]).toEqual(["POST", String(CHUNKED_FROM + 10)]);
    create.respond(200, { id: "a".repeat(32), received: 0, size: CHUNKED_FROM + 10, chunkSize: CHUNKED_FROM });
    const first = await at(2);
    expect([first.method, first.params.offset, (first.body as Blob).size]).toEqual(["PUT", "0", CHUNKED_FROM]);
    expect(session.id).toBe("a".repeat(32));
    first.fail(); // сеть оборвалась посреди части
    await vi.advanceTimersByTimeAsync(1000);
    const retry = await at(3);
    expect(retry.params.offset).toBe("0");
    // Сервер успел принять часть до обрыва — говорит, сколько у него есть.
    retry.respond(409, { error: "Часть не с того места", received: CHUNKED_FROM });
    const second = await at(4);
    expect([second.params.offset, (second.body as Blob).size]).toEqual([String(CHUNKED_FROM), 10]);
    second.respond(200, { id: session.id, received: CHUNKED_FROM + 10, size: CHUNKED_FROM + 10 });
    const complete = await at(5);
    expect(complete.url).toBe(`/api/uploads/sessions/${"a".repeat(32)}/complete`);
    complete.respond(200, { url: "/uploads/sha_big.mp4", name: "clip.mp4", size: CHUNKED_FROM + 10, kind: "video" });
    await expect(done).resolves.toMatchObject({ url: "/uploads/sha_big.mp4" });
    expect(progress.at(-1)).toBe(1);
    expect(session.id).toBeUndefined();
  });

  it("продолжение начатой загрузки (пауза, перезапуск приложения): с принятого сервером места", async () => {
    const big = new File([new Uint8Array(CHUNKED_FROM + 10)], "clip.mp4", { type: "video/mp4" });
    const done = uploadFile(big, "video", { session: { id: "b".repeat(32) } });
    const status = await next();
    expect([status.method, status.url]).toEqual(["GET", `/api/uploads/sessions/${"b".repeat(32)}`]);
    status.respond(200, { id: "b".repeat(32), received: CHUNKED_FROM, size: CHUNKED_FROM + 10, chunkSize: CHUNKED_FROM });
    await vi.waitFor(() => expect(FakeXhr.requests).toHaveLength(2));
    expect(FakeXhr.requests[1]!.params.offset).toBe(String(CHUNKED_FROM));
    FakeXhr.requests[1]!.respond(200, { received: CHUNKED_FROM + 10, size: CHUNKED_FROM + 10 });
    await vi.waitFor(() => expect(FakeXhr.requests).toHaveLength(3));
    FakeXhr.requests[2]!.respond(200, { url: "/uploads/sha_r.mp4" });
    await expect(done).resolves.toMatchObject({ url: "/uploads/sha_r.mp4" });
  });
});
