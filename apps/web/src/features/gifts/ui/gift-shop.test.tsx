import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openGiftShop } from "@/entities/gift";
import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";
import { AskHost, Toaster } from "@/shared/ui";

import { GiftShopHost } from "./gift-shop-host";

const ME = { id: "u_alice0000", name: "Алиса", isPremium: false };
const CAKE = { id: "cake", emoji: "🎂", name: "Торт", priceRub: 25, priceStars: 250, premiumDays: 0 };
const HEART = { id: "heart", emoji: "❤️", name: "Сердце", priceRub: 10, priceStars: 100, premiumDays: 0 };

function renderShop() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: ME } as never);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GiftShopHost />
        <AskHost />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Отправить подарок»", () => {
  it("выбор подарка, подпись и отправка: запрос с получателем, окно закрывается", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    const api = fakeApi({
      "GET /api/gifts": { body: { gifts: [CAKE, HEART], balance: 300 } },
      "GET /api/gifts/custom": { body: { gifts: [] } },
      "GET /api/users/u_boris0000": { body: { user: { id: "u_boris0000", name: "Борис" } } },
      "POST /api/gifts/buy": { body: { chatId: "c_dm0000001", serial: null, delivered: true, balance: 50 } },
    });
    renderShop();
    openGiftShop({ recipient: { id: "u_boris0000", name: "Борис" } });

    expect(await screen.findByRole("button", { name: "Баланс ⭐ 300" })).toBeTruthy();
    expect(screen.getByText("Борис получит подарок в профиль, а в вашем чате появится сообщение о нём.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Торт" }));

    expect(screen.getByText(/^Вы отправили подарок за 250/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Скрыть моё имя" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Анонимные подарки доступны с Premium.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение к подарку" }), { target: { value: "С днём рождения!" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить подарок за ⭐ 250" }));

    expect(await screen.findByText("«Торт» отправлен — Борис")).toBeTruthy();
    expect(api.calls.find((c) => c.key === "POST /api/gifts/buy")?.body).toEqual({ giftId: "cake", recipientId: "u_boris0000", background: null, anonymous: false, note: "С днём рождения!" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Отправить подарок" })).toBeNull());
  });

  it("не хватает звёзд — предупреждение и вопрос о покупке", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    fakeApi({
      "GET /api/gifts": { body: { gifts: [HEART], balance: 0 } },
      "GET /api/gifts/custom": { body: { gifts: [] } },
      "GET /api/users/u_boris0000": { body: { user: { id: "u_boris0000", name: "Борис" } } },
      "POST /api/gifts/buy": { status: 402, body: { error: "Не хватает звёзд", needStars: 100, balance: 0 } },
    });
    renderShop();
    openGiftShop({ recipient: { id: "u_boris0000", name: "Борис" } });
    fireEvent.click(await screen.findByRole("button", { name: "Сердце" }));
    expect(screen.getByText(/^Не хватает 100\s*— при отправке предложим докупить\.$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Отправить подарок за ⭐ 100" }));
    expect(await screen.findByRole("heading", { name: "Не хватает звёзд. Открыть покупку звёзд?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "OK" })).toBeTruthy();
  });
});
