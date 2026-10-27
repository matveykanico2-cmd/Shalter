import { afterEach, describe, expect, it, vi } from "vitest";

import { installNativeDownloads } from "./native-download";

type CapWindow = Window & { Capacitor?: unknown };

afterEach(() => {
  delete (window as CapWindow).Capacitor;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function setup(platform: "ios" | "android") {
  const fs = { stat: vi.fn().mockRejectedValue(new Error("нет")), writeFile: vi.fn().mockResolvedValue({ uri: "file:///cache/a.txt" }) };
  const share = { share: vi.fn().mockResolvedValue(undefined) };
  (window as CapWindow).Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: { Filesystem: fs, Share: share } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("hello")));
  const notify = vi.fn();
  const off = installNativeDownloads(notify);
  const a = Object.assign(document.createElement("a"), { href: "/uploads/a.txt" });
  a.setAttribute("download", "a.txt");
  document.body.append(a);
  a.click();
  return { fs, share, notify, off };
}

describe("скачивание в приложении", () => {
  it("Android: в «Документы/Shalter»", async () => {
    const { fs, share, notify, off } = setup("android");
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("Сохранено: Документы/Shalter/a.txt"));
    expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: "Shalter/a.txt", directory: "DOCUMENTS" }));
    expect(share.share).not.toHaveBeenCalled();
    off();
  });

  it("iOS: сразу «Поделиться» (папка «Документы» приложения на iPhone не видна)", async () => {
    const { fs, share, off } = setup("ios");
    await vi.waitFor(() => expect(share.share).toHaveBeenCalledWith({ title: "a.txt", files: ["file:///cache/a.txt"] }));
    expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({ directory: "CACHE" }));
    off();
  });
});
