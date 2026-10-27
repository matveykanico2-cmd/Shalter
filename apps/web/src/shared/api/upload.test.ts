import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeXhr, fakeXhr } from "../lib/test";

import { UPLOAD_CANCELLED, uploadFile } from "./upload";

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
});
