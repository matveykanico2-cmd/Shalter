import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { ChatHistoryClear } from "./chat-history-clear";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Удалить историю за дату»", () => {
  const tz = -new Date(2026, 9, 26).getTimezoneOffset();

  it("выбирает дни с сообщениями и удаляет историю за последний выбранный", async () => {
    fakeApi({
      [`GET /api/chats/c_1/messages/days?month=2026-10&tz=${tz}`]: { body: { days: ["2026-10-05", "2026-10-12"] } },
      [`DELETE /api/chats/c_1/messages/by-date?day=2026-10-12`]: { body: { ok: true } },
    });
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatHistoryClear chatId="c_1" onClose={onClose} />
      </QueryClientProvider>
    );
    expect(screen.getByRole("heading", { name: "Удалить историю за дату" })).toBeTruthy();
    const five = await screen.findByRole("button", { name: "5" });
    fireEvent.click(five);
    const twelve = screen.getByRole("button", { name: "12" });
    expect((twelve as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(twelve);
    const del = screen.getByRole("button", { name: /Удалить историю за 2 дн/ });
    fireEvent.click(del);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("кнопка удаления неактивна, пока не выбран ни один день", async () => {
    fakeApi({
      [`GET /api/chats/c_1/messages/days?month=2026-10&tz=${tz}`]: { body: { days: ["2026-10-05"] } },
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatHistoryClear chatId="c_1" onClose={vi.fn()} />
      </QueryClientProvider>
    );
    expect((screen.getByRole("button", { name: /Удалить историю/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
