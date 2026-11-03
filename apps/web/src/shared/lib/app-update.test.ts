import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "./test";

const STARTED_AT = "2026-11-03T10:00:00.000Z";
const serverVersion = (version: string) => fakeApi({ "GET /api/version": { body: { version, startedAt: STARTED_AT } } });

// Состояние — в модуле: каждый тест берёт его заново.
const load = () => import("./app-update");

function pageVersion(version: string) {
  const meta = document.createElement("meta");
  meta.name = "shalter-version";
  meta.content = version;
  document.head.append(meta);
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="shalter-version"]').forEach((m) => m.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("обновление веб-приложения", () => {
  it("версия страницы из <meta> — сервер с другой сборкой значит «есть обновление», откат — кнопка пропадает", async () => {
    pageVersion("aaa");
    const { checkForUpdate, currentVersion } = await load();
    serverVersion("bbb");
    expect(await checkForUpdate()).toBe(true);
    expect(currentVersion()).toBe("aaa");
    serverVersion("aaa");
    expect(await checkForUpdate()).toBe(false);
  });

  it("без <meta> (dev) первая версия сервера — своя; dev не сравнивается", async () => {
    const { checkForUpdate, currentVersion } = await load();
    serverVersion("dev");
    expect(await checkForUpdate()).toBe(false);
    serverVersion("aaa");
    expect(await checkForUpdate()).toBe(false);
    expect(currentVersion()).toBe("aaa");
    serverVersion("bbb");
    expect(await checkForUpdate()).toBe(true);
  });

  it("«Обновить» обновляет service worker и перезагружает страницу; повторное нажатие ждёт первое", async () => {
    const { applyUpdate } = await load();
    let finish = () => {};
    const update = vi.fn(() => new Promise<void>((r) => (finish = r)));
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ update }) } });
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const first = applyUpdate();
    await applyUpdate();
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    finish();
    await first;
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
