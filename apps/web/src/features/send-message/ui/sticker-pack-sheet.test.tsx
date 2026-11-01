import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Sticker } from "@/shared/lib/anim";
import { fakeApi } from "@/shared/lib/test";
import { AskHost } from "@/shared/ui";

import { StickerPackSheet } from "./sticker-pack-sheet";
import { StickerButton } from "./sticker-picker";

const pack = {
  id: "sp_1_a",
  ownerId: "u_owner",
  name: "Котики",
  description: "Пушистые и мурчащие",
  stickers: [
    { emoji: "😺", name: "мяу", uid: "st_00000001" },
    { emoji: "😹", name: "смех", uid: "st_00000002" },
  ],
  createdAt: "2026-10-01T10:00:00.000Z",
};

function renderSheet(sticker: Sticker, meId = "u_me") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSend = vi.fn();
  const onEdit = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <StickerPackSheet sticker={sticker} meId={meId} onSend={onSend} onEdit={onEdit} onClose={onClose} />
    </QueryClientProvider>
  );
  return { onSend, onEdit, onClose };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("окно стикерпака по клику на стикер в ленте", () => {
  it("чужой пак: название, описание, стикеры; «Добавить» → «Удалить»", async () => {
    let installed = false;
    const { calls } = fakeApi({
      "GET /api/stickers/packs/sp_1_a": () => ({ body: { pack, installed } }),
      "POST /api/stickers/packs/sp_1_a/install": () => {
        installed = true;
        return { body: { pack, installed } };
      },
      "DELETE /api/stickers/packs/sp_1_a/install": () => {
        installed = false;
        return { body: { ok: true } };
      },
      "GET /api/stickers/packs": { body: { packs: [], maxStickers: 60 } },
    });
    renderSheet({ emoji: "😺", name: "мяу", packId: "sp_1_a" });
    expect(await screen.findByRole("dialog", { name: "Котики" })).toBeTruthy();
    expect(screen.getByText("Пушистые и мурчащие")).toBeTruthy();
    expect(screen.getByText("2 стикера")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Добавить 2 стикера" }));
    expect(await screen.findByRole("button", { name: "Удалить 2 стикера" })).toBeTruthy();
    expect(calls.some((c) => c.key === "POST /api/stickers/packs/sp_1_a/install")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Удалить 2 стикера" }));
    expect(await screen.findByRole("button", { name: "Добавить 2 стикера" })).toBeTruthy();
    expect(calls.some((c) => c.key === "DELETE /api/stickers/packs/sp_1_a/install")).toBe(true);
  });

  it("клик по стикеру в окне отправляет его с packId и закрывает окно", async () => {
    fakeApi({ "GET /api/stickers/packs/sp_1_a": { body: { pack, installed: false } } });
    const { onSend, onClose } = renderSheet({ emoji: "😺", name: "мяу", packId: "sp_1_a" });
    fireEvent.click(await screen.findByRole("button", { name: "Отправить «смех»" }));
    expect(onSend).toHaveBeenCalledWith({ ...pack.stickers[1], packId: "sp_1_a" });
    expect(onClose).toHaveBeenCalled();
  });

  it("свой пак — «Изменить пак» вместо «Добавить»", async () => {
    fakeApi({ "GET /api/stickers/packs/sp_1_a": { body: { pack, installed: true } } });
    const { onEdit } = renderSheet({ emoji: "😺", name: "мяу", packId: "sp_1_a" }, "u_owner");
    fireEvent.click(await screen.findByRole("button", { name: "Изменить пак" }));
    expect(onEdit).toHaveBeenCalledWith(pack);
    expect(screen.queryByRole("button", { name: /Добавить/ })).toBeNull();
  });

  it("автор удалил пак — так и пишем", async () => {
    fakeApi({ "GET /api/stickers/packs/sp_1_a": { status: 404, body: { error: "Пак не найден" } } });
    renderSheet({ emoji: "😺", name: "мяу", packId: "sp_1_a" });
    expect(await screen.findByText("Автор удалил этот стикерпак")).toBeTruthy();
  });

  it("встроенный стикер — встроенный набор, без кнопки добавления", async () => {
    fakeApi({});
    renderSheet({ emoji: "👋", name: "Привет", scene: "hello" });
    expect(screen.getByRole("dialog", { name: "Shalter" })).toBeTruthy();
    expect(screen.getByText("Этот набор есть у всех")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Добавить/ })).toBeNull();
  });

  it("старое сообщение без packId — пак находится по метке стикера среди своих", async () => {
    fakeApi({
      "GET /api/stickers/packs": { body: { packs: [pack], maxStickers: 60 } },
      "GET /api/stickers/packs/sp_1_a": { body: { pack, installed: true } },
    });
    renderSheet({ emoji: "😹", name: "смех", uid: "st_00000002" });
    expect(await screen.findByRole("dialog", { name: "Котики" })).toBeTruthy();
  });
});

describe("выбор стикера", () => {
  it("клик по стикеру добавленного пака отправляет его с packId; пак можно убрать", async () => {
    let packs = [pack];
    const { calls } = fakeApi({
      "GET /api/stickers/packs": () => ({ body: { packs, maxStickers: 60 } }),
      "DELETE /api/stickers/packs/sp_1_a/install": () => {
        packs = [];
        return { body: { ok: true } };
      },
    });
    const onSend = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <StickerButton chatId="c_1" meId="u_me" onSend={onSend} />
        <AskHost />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Стикеры" }));
    fireEvent.click(await screen.findByRole("button", { name: "смех" }));
    expect(onSend).toHaveBeenCalledWith({ emoji: "😹", name: "смех", uid: "st_00000002", packId: "sp_1_a" });

    fireEvent.click(screen.getByRole("button", { name: "Стикеры" }));
    expect(screen.queryByRole("button", { name: "Изменить пак «Котики»" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Убрать пак «Котики»" }));
    fireEvent.click(await screen.findByRole("button", { name: "Убрать" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /api/stickers/packs/sp_1_a/install")).toBe(true));
  });
});
