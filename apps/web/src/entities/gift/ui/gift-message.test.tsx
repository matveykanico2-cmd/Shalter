import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionQueries } from "@/entities/session/@x/gift";

import { fakeApi } from "@/shared/lib/test";
import { AskHost, Toaster } from "@/shared/ui";

import { GiftMessage } from "./gift-message";

const GIFT = {
  giftId: "cake",
  emoji: "🎂",
  name: "Торт",
  priceRub: 25,
  priceStars: 250,
  premiumDays: 0,
  durationLabel: null,
  note: "С днём рождения!",
  fromId: "u_alice0000",
  fromName: "Алиса",
  recipientId: "u_boris0000",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("подарок в ленте", () => {
  it("получатель: строка о подарке, подпись, обмен на звёзды и карточка", async () => {
    const shelf = [{ ...GIFT, id: "rg_abc_0123abcd", at: "2026-10-26T10:00:00.000Z" }];
    const api = fakeApi({
      "GET /api/users/u_boris0000": { body: { user: { id: "u_boris0000", name: "Борис", giftsReceived: shelf } } },
      "POST /api/gifts/received/rg_abc_0123abcd/convert": { body: { balance: 250, gained: 250, user: { giftsReceived: [] } } },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(sessionQueries.current().queryKey, { user: { id: "u_boris0000", name: "Борис" } } as never);
    render(
      <QueryClientProvider client={client}>
        <GiftMessage messageId="m_1" gift={GIFT} mine={false} meta={null} />
        <AskHost />
        <Toaster />
      </QueryClientProvider>
    );
    expect(screen.getByText(/^Алиса отправил\(а\) вам подарок за 250/)).toBeTruthy();
    expect(screen.getByText("С днём рождения!")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Обменять на 250 ⭐" }));
    fireEvent.click(await screen.findByRole("button", { name: "Обменять" }));
    expect(await screen.findByText(/^Получено 250/)).toBeTruthy();
    await waitFor(() => expect(api.calls.some((c) => c.key === "POST /api/gifts/received/rg_abc_0123abcd/convert")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Посмотреть" }));
    expect(screen.getByText("От кого")).toBeTruthy();
    expect(screen.getByText("Владелец")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отправить такой же" })).toBeTruthy();
  });
});
