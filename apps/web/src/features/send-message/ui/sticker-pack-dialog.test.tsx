import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { StickerButton } from "./sticker-picker";

const pack = { id: "sp_1", name: "Котики", stickers: [{ emoji: "😺", name: "" }], createdAt: "2026-10-01T10:00:00.000Z" };

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
  it("из выбора стикера: список паков, новый пак из эмодзи, удаление", async () => {
    let packs = [pack];
    const { calls } = fakeApi({
      "GET /api/stickers/packs": () => ({ body: { packs, maxStickers: 60 } }),
      "POST /api/stickers/packs": (body) => {
        const created = { id: "sp_2", createdAt: pack.createdAt, ...(body as { name: string; stickers: [] }) };
        packs = [...packs, created];
        return { body: { pack: created } };
      },
      "DELETE /api/stickers/packs/sp_1": () => {
        packs = packs.filter((p) => p.id !== "sp_1");
        return { body: { ok: true } };
      },
    });
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Стикеры" }));
    fireEvent.click(await screen.findByRole("button", { name: "Мои стикерпаки" }));
    expect(screen.getByRole("dialog", { name: "Стикерпаки" })).toBeTruthy();
    expect(await screen.findByText("Котики")).toBeTruthy();
    expect(screen.getByText("1 шт.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    expect(screen.getByRole("dialog", { name: "Новый пак" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    expect(screen.getByRole("alert").textContent).toBe("Назовите пак");
    fireEvent.change(screen.getByRole("textbox", { name: "Название пака" }), { target: { value: "Мои" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    expect(screen.getByRole("alert").textContent).toBe("Добавьте хотя бы один стикер");
    fireEvent.change(screen.getByRole("textbox", { name: "Эмодзи" }), { target: { value: "🔥" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Подпись" }), { target: { value: "огонь" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Анимация" }), { target: { value: "cat_yarn" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(screen.getByText("Стикеры (1)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    await screen.findByText("Мои");
    expect(screen.getByRole("dialog", { name: "Стикерпаки" })).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/stickers/packs")?.body).toEqual({ name: "Мои", stickers: [{ emoji: "🔥", name: "огонь", scene: "cat_yarn" }] });

    fireEvent.click(screen.getByRole("button", { name: "Удалить «Котики»" }));
    await waitFor(() => expect(screen.queryByText("Котики")).toBeNull());
  });

  it("«Нарисовать картинку» открывает рисовалку стикера, «Назад» — к списку", async () => {
    fakeApi({ "GET /api/stickers/packs": { body: { packs: [], maxStickers: 60 } } });
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Стикеры" }));
    fireEvent.click(await screen.findByRole("button", { name: "Мои стикерпаки" }));
    expect(await screen.findByText("У вас пока нет своих паков")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Создать пак" }));
    fireEvent.click(screen.getByRole("button", { name: "🖌️ Нарисовать картинку" }));
    expect(screen.getByRole("dialog", { name: "Нарисовать стикер" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.getByRole("dialog", { name: "Стикерпаки" })).toBeTruthy();
  });
});
