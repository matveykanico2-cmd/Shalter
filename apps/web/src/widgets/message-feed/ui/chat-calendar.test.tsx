import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { ChatCalendar } from "./chat-calendar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Перейти к дате»", () => {
  it("дни с сообщениями нажимаются и ведут к первому сообщению дня; пустые — нет", async () => {
    const tz = -new Date(2026, 9, 26).getTimezoneOffset();
    fakeApi({
      [`GET /api/chats/c_1/messages/days?month=2026-10&tz=${tz}`]: { body: { days: ["2026-10-05"] } },
      [`GET /api/chats/c_1/messages/at?day=2026-10-05&tz=${tz}`]: { body: { message: { id: "m_1" } } },
    });
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatCalendar chatId="c_1" around="2026-10-26T10:00:00.000Z" onPick={onPick} onClose={onClose} />
      </QueryClientProvider>
    );
    expect(screen.getByRole("heading", { name: "Перейти к дате" })).toBeTruthy();
    expect(screen.getByText("октябрь 2026")).toBeTruthy();
    const five = await screen.findByRole("button", { name: "5" });
    await waitFor(() => expect((five as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByRole("button", { name: "6" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(five);
    await waitFor(() => expect(onPick).toHaveBeenCalledWith("m_1"));
    expect(onClose).toHaveBeenCalled();
  });
});
