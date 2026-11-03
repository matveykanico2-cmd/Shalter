import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { StickerButton } from "./sticker-picker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("панель стикеров", () => {
  it("заголовок встроенного пака открывает его окно без ленты чата; стикер из окна отправляется", async () => {
    fakeApi({ "GET /api/stickers/packs": { body: { packs: [], maxStickers: 30 } }, "POST /api/chats/c_1/typing": { body: { ok: true } } });
    const onSend = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <StickerButton chatId="c_1" onSend={onSend} />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Стикеры" }));
    const section = await screen.findByRole("region", { name: "Котик Мурка" });
    fireEvent.click(within(section).getByRole("button", { name: "Открыть пак «Котик Мурка»" }));
    const sheet = await screen.findByRole("dialog", { name: "Котик Мурка" });
    // Панель закрылась, открыто одно окно пака.
    expect(screen.queryByRole("region", { name: "Котик Мурка" })).toBeNull();
    fireEvent.click(within(sheet).getAllByRole("button")[0]!);
    expect(onSend).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Котик Мурка" })).toBeNull();
  });
});
