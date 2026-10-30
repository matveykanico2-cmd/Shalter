import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { StickerButton } from "./sticker-picker";

const pack = { id: "sp_1", name: "Котики", ownerId: "u_1", description: null, stickers: [], stickerCount: 0, isAdded: false, isOwner: true, createdAt: "2026-10-01T10:00:00.000Z" };

function renderPicker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StickerButton chatId="c_1" onSend={vi.fn()} />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Мои стикерпаки» (stickerPackDialog.js)", () => {
  it("список паков, создание пака, добавление в коллекцию, удаление", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let packs = [pack];
    const { calls } = fakeApi({
      "GET /api/stickers/packs": () => ({ body: { packs, maxStickers: 30 } }),
      "POST /api/stickers/packs": (body) => {
        const created = { id: "sp_2", ownerId: "u_1", createdAt: pack.createdAt, name: (body as { name: string }).name, description: null, stickers: [], stickerCount: 0, isAdded: false, isOwner: true };
        packs = [...packs, created];
        return { body: { pack: created } };
      },
      "POST /api/stickers/packs/sp_1/collection": () => {
        packs = packs.map((p) => p.id === "sp_1" ? { ...p, isAdded: true } : p);
        return { body: { ok: true } };
      },
      "DELETE /api/stickers/packs/sp_1/collection": () => {
        packs = packs.map((p) => p.id === "sp_1" ? { ...p, isAdded: false } : p);
        return { body: { ok: true } };
      },
      "DELETE /api/stickers/packs/sp_1": () => {
        packs = packs.filter((p) => p.id !== "sp_1");
        return { body: { ok: true } };
      },
    });
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Стикеры" }));
    fireEvent.click(await screen.findByRole("button", { name: "Мои стикерпаки" }));
    expect(screen.getByRole("dialog", { name: "Мои стикерпаки" })).toBeTruthy();
    expect(await screen.findByText("Котики")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    expect(screen.getByRole("dialog", { name: "Новый пак" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    expect(screen.getByRole("alert").textContent).toBe("Назовите пак");
    fireEvent.change(screen.getByRole("textbox", { name: "Название пака" }), { target: { value: "Мои" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    await screen.findByText("Мои");
    expect(screen.getByRole("dialog", { name: "Мои стикерпаки" })).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/stickers/packs")?.body).toMatchObject({ name: "Мои" });

    // Удалить пак (владелец)
    fireEvent.click(screen.getByRole("button", { name: "Удалить «Котики»" }));
    await waitFor(() => expect(screen.queryByText("Котики")).toBeNull());
  });

  it("пустой список — показывает заглушку и кнопку создания", async () => {
    fakeApi({ "GET /api/stickers/packs": { body: { packs: [], maxStickers: 30 } } });
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Стикеры" }));
    fireEvent.click(await screen.findByRole("button", { name: "Мои стикерпаки" }));
    expect(await screen.findByText("У вас пока нет стикерпаков")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    expect(screen.getByRole("dialog", { name: "Новый пак" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
  });
});
