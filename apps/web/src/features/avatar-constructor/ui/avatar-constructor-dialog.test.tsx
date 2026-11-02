import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { AvatarConstructorDialog } from "./avatar-constructor-dialog";

const sticker = (id: string, url: string, emoji: string) => ({ id, packId: "sp_me_1", url, emoji, position: 0, createdAt: "2026-01-01T00:00:00.000Z" });
const pack = {
  id: "sp_me_1",
  name: "Мои",
  isAdded: true,
  isOwner: true,
  stickers: [sticker("st_00000001", "/uploads/cat.webp", "🐱"), sticker("st_00000002", "/uploads/dance.webm", "💃"), sticker("st_00000003", "/uploads/duck.tgs", "🦆")],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  fakeApi({ "GET /api/stickers/packs": { body: { packs: [pack], maxStickers: 120 } } });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AvatarConstructorDialog onClose={() => undefined} onDone={() => undefined} />
    </QueryClientProvider>
  );
}

const pointer = (type: "pointerDown" | "pointerMove" | "pointerUp", el: Element, pointerId: number, clientX: number, clientY: number) => {
  const ev = new MouseEvent(type.toLowerCase(), { bubbles: true, cancelable: true, clientX, clientY });
  Object.defineProperty(ev, "pointerId", { value: pointerId });
  fireEvent(el, ev);
};

describe("«Собрать аватар»", () => {
  it("анимированные стикеры есть в выборе: видео играет, lottie — анимированная плитка", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Стикер" }));
    expect(await screen.findByRole("button", { name: "Стикер 💃" })).toBeTruthy();
    const video = screen.getByRole("button", { name: "Стикер 💃" }).querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/uploads/dance.webm");
    expect(video.autoplay && video.loop && video.muted).toBe(true);
    expect(screen.getByRole("button", { name: "Стикер 🦆" }).querySelector('[role="img"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Стикер 🐱" }).querySelector("img")).toBeTruthy();
  });

  it("щипок двумя пальцами меняет размер и поворот выбранного слоя; ползунки и колесо тоже", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Стикер" }));
    fireEvent.click(await screen.findByRole("button", { name: "Стикер 💃" }));
    const preview = screen.getByLabelText("Предпросмотр аватара");
    const layerEl = preview.querySelector("video")!;
    const size = () => (screen.getByRole("slider", { name: "Размер" }) as HTMLInputElement).value;
    const turn = () => (screen.getByRole("slider", { name: "Поворот" }) as HTMLInputElement).value;
    expect(size()).toBe("50");
    expect(turn()).toBe("0");

    pointer("pointerDown", layerEl, 1, 100, 100);
    pointer("pointerDown", preview, 2, 200, 100);
    // Второй палец повернулся на 90° вокруг первого и ушёл вдвое дальше.
    pointer("pointerMove", preview, 2, 100, 300);
    expect(size()).toBe("100");
    expect(turn()).toBe("90");
    expect(layerEl.style.transform).toBe("translate(-50%, -50%) rotate(90deg)");
    pointer("pointerUp", preview, 2, 100, 300);
    pointer("pointerUp", preview, 1, 100, 100);

    fireEvent.change(screen.getByRole("slider", { name: "Поворот" }), { target: { value: "-30" } });
    expect(layerEl.style.transform).toBe("translate(-50%, -50%) rotate(-30deg)");
    fireEvent.wheel(preview, { deltaY: 100 });
    expect(size()).toBe("92");
  });
});
