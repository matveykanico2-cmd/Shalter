import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hasRecentPhotos, listRecentPhotos, readRecentPhoto } from "../lib/recent-photos";

import { AttachButton } from "./attach-button";

const PHOTOS = [
  { id: "11", uri: "content://media/11", thumb: "AAAA", mime: "image/jpeg", name: "a.jpg" },
  { id: "12", uri: "content://media/12", thumb: "BBBB", mime: "image/png", name: "b.png" },
  { id: "13", uri: "content://media/13", thumb: "CCCC", mime: "image/jpeg", name: "c.jpg" },
];

type W = Window & { Capacitor?: unknown };

function installPlugin(overrides: Partial<{ list: unknown; read: unknown }> = {}) {
  const plugin = {
    list: vi.fn(async () => ({ photos: PHOTOS })),
    // «hi» в base64 — 2 байта.
    read: vi.fn(async ({ id }: { id: string }) => ({ data: btoa(`hi${id}`), mime: PHOTOS.find((p) => p.id === id)!.mime, name: `${id}.bin` })),
    ...overrides,
  };
  (window as W).Capacitor = { isNativePlatform: () => true, Plugins: { RecentPhotos: plugin } };
  return plugin;
}

function phone(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
}

const noop = () => {};
function renderAttach(onFiles = vi.fn()) {
  render(
    <AttachButton
      onFiles={onFiles}
      onPoll={noop}
      onChecklist={noop}
      onDice={noop}
      onGames={noop}
      onLocation={noop}
      onContact={noop}
      onHugo={noop}
      onMeme={noop}
      onPaint={noop}
    />,
  );
  fireEvent.click(screen.getByTitle("Вложение"));
  return onFiles;
}

afterEach(() => {
  cleanup();
  delete (window as W).Capacitor;
});

describe("recent photos bridge", () => {
  it("без плагина — нет ленты и пустой список", async () => {
    expect(hasRecentPhotos()).toBe(false);
    expect(await listRecentPhotos()).toEqual([]);
    (window as W).Capacitor = { isNativePlatform: () => false, Plugins: { RecentPhotos: {} } };
    expect(hasRecentPhotos()).toBe(false);
  });

  it("ошибка плагина (нет разрешения) — пустой список", async () => {
    installPlugin({ list: vi.fn(async () => Promise.reject(new Error("denied"))) });
    expect(await listRecentPhotos()).toEqual([]);
  });

  it("read отдаёт File с байтами, типом и именем", async () => {
    const plugin = installPlugin();
    const file = await readRecentPhoto(PHOTOS[1]!);
    expect(plugin.read).toHaveBeenCalledWith({ id: "12" });
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("12.bin");
    expect(file.type).toBe("image/png");
    expect(await file.text()).toBe("hi12");
  });

  it("большой снимок читается по кускам, пока done: false", async () => {
    const chunks: Record<number, { data: string; done: boolean }> = { 0: { data: btoa("abc"), done: false }, 3: { data: btoa("def"), done: true } };
    const plugin = installPlugin({ read: vi.fn(async ({ offset = 0 }: { id: string; offset?: number }) => ({ ...chunks[offset]!, mime: "image/jpeg", name: "big.jpg" })) });
    const file = await readRecentPhoto(PHOTOS[0]!);
    expect(plugin.read).toHaveBeenNthCalledWith(1, { id: "11" });
    expect(plugin.read).toHaveBeenNthCalledWith(2, { id: "11", offset: 3 });
    expect(await file.text()).toBe("abcdef");
  });
});

describe("лента последних фото в шторке скрепки", () => {
  it("в браузере ленты нет, кнопки на месте", () => {
    phone(true);
    renderAttach();
    expect(screen.getByRole("button", { name: "Галерея" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Последние фото" })).toBeNull();
  });

  it("выбор с номерами и «Отправить (N)» отдаёт File в порядке выбора", async () => {
    phone(true);
    const plugin = installPlugin();
    const onFiles = renderAttach();
    await screen.findByRole("group", { name: "Последние фото" });
    expect(plugin.list).toHaveBeenCalledWith({ limit: 30 });
    expect(screen.getByRole("button", { name: "Галерея" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Фото 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Фото 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Фото 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Фото 2" })); // снять выбор
    expect(screen.getByRole("button", { name: "Фото 3" }).textContent).toBe("1");
    expect(screen.getByRole("button", { name: "Фото 1" }).textContent).toBe("2");
    expect(screen.getByRole("button", { name: "Фото 2" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Отправить (2)" }));
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    const files = onFiles.mock.calls[0]![0] as File[];
    expect(files.map((f) => f.name)).toEqual(["13.bin", "11.bin"]);
    // Шторка закрылась.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("после отказа — кнопка «Разрешить доступ к фото», она спрашивает снова", async () => {
    phone(true);
    const plugin = installPlugin({
      list: vi.fn(async (o: { prompt?: true }) => (o.prompt ? { photos: PHOTOS } : { photos: [], denied: true })),
    });
    renderAttach();
    fireEvent.click(await screen.findByRole("button", { name: "Разрешить доступ к фото" }));
    await screen.findByRole("group", { name: "Последние фото" });
    expect(plugin.list).toHaveBeenLastCalledWith({ limit: 30, prompt: true });
  });

  it("на широком экране ленты нет даже с плагином", () => {
    phone(false);
    const plugin = installPlugin();
    renderAttach();
    expect(screen.queryByRole("group", { name: "Последние фото" })).toBeNull();
    expect(plugin.list).not.toHaveBeenCalled();
  });
});
