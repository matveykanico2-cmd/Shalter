import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openStarsDialog } from "@/entities/stars";

import { fakeApi } from "@/shared/lib/test";

import { PremiumSection } from "./premium-section";
import { PurchaseHost } from "./purchase-host";
import { StarsSection } from "./stars-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const STARS = {
  balance: 300,
  userId: "u_me0000000",
  messagePriceStars: 0,
  packs: [
    { id: "s50", stars: 50, priceRub: 100 },
    { id: "s250", stars: 250, priceRub: 500 },
  ],
  costs: { boost: 10, boostMinutes: 60, delete: 5, maxMessagePrice: 1000 },
};

const PREMIUM = {
  isPremium: false,
  premiumForever: false,
  isAdmin: false,
  starsBalance: 450,
  plans: {
    m1: { days: 30, priceRub: 99, label: "1 месяц", stars: 50 },
    m12: { days: 360, priceRub: 799, label: "12 месяцев", stars: 400 },
  },
};

function renderAt(element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/settings/x", element },
      { path: "/chat/:chatId", element: <p>чат</p> },
    ],
    { initialEntries: ["/settings/x"] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

describe("«Звёзды»", () => {
  it("баланс, перевод другу из подсказок поиска и новый баланс", async () => {
    const { calls } = fakeApi({
      "GET /api/stars": { body: STARS },
      "GET /api/search?q=%D0%91%D0%BE%D1%80": { body: { chats: [], channels: [], users: [{ id: "u_boris0000", name: "Борис", username: "boris" }], bots: [], games: [], messages: [] } },
      "POST /api/stars/transfer": { body: { ok: true, amount: 120, balance: 180, to: { id: "u_boris0000", name: "Борис" }, from: "u_me0000000" } },
    });
    renderAt(<StarsSection />);
    // Баланс — подпись и число со звездой рядом.
    expect((await screen.findByText("Баланс")).nextElementSibling?.textContent).toBe("300");
    expect(screen.getByRole("button", { name: "+50 100 ₽" })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Имя или @ник"), { target: { value: "Бор" } });
    fireEvent.click(await screen.findByRole("button", { name: "Борис · @boris" }, { timeout: 2000 }));
    expect(screen.getByText("Получатель: Борис")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Сколько ⭐"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(screen.getByText("Баланс").nextElementSibling?.textContent).toBe("180"));
    expect(calls.find((c) => c.key === "POST /api/stars/transfer")?.body).toEqual({ userId: "u_boris0000", amount: 120 });
  });

  it("набор с донат-сервисом — окно с кодом заказа; без админа — ошибка на месте", async () => {
    fakeApi({
      "GET /api/stars": { body: STARS },
      "POST /api/stars/request": (body) =>
        body.packId === "s250"
          ? { body: { code: "SHP-ABCDEF", donationUrl: "https://pay.example/", provider: "donatepay", amountRub: 500 } }
          : { status: 503, body: { error: "Администрация Shalter ещё не зарегистрирована в приложении" } },
    });
    renderAt(
      <>
        <StarsSection />
        <PurchaseHost />
      </>
    );
    fireEvent.click(await screen.findByRole("button", { name: "+50 100 ₽" }));
    expect(await screen.findByText("Администрация Shalter ещё не зарегистрирована в приложении")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "+250 500 ₽" }));
    const dialog = await screen.findByRole("dialog", { name: "Оплата через DonatePay" });
    expect(within(dialog).getByText("SHP-ABCDEF")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Перейти к оплате" }).getAttribute("href")).toBe("https://pay.example/");
    fireEvent.click(within(dialog).getByRole("button", { name: "Готово" }));
    expect(screen.queryByRole("dialog", { name: "Оплата через DonatePay" })).toBeNull();
  });

  it("окно звёзд открывается откуда угодно и закрывается крестиком", async () => {
    fakeApi({ "GET /api/stars": { body: { ...STARS, balance: 0 } } });
    renderAt(<PurchaseHost />);
    act(() => openStarsDialog());
    const dialog = await screen.findByRole("dialog", { name: "Звёзды" });
    expect(await within(dialog).findByText("Купить звёзды")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog", { name: "Звёзды" })).toBeNull();
  });
});

describe("«Shalter Premium»", () => {
  it("выбран выгодный тариф; покупка за звёзды ведёт в чат с квитанцией", async () => {
    const { calls } = fakeApi({
      "GET /api/premium/me": { body: PREMIUM },
      "POST /api/premium/buy-with-stars": { body: { delivered: true, stars: 400, balance: 50, chatId: "c_saved" } },
    });
    const router = renderAt(<PremiumSection />);
    expect(await screen.findByRole("radio", { name: /12 месяцев/ })).toHaveProperty("ariaChecked", "true");
    expect(screen.getByRole("button", { name: "Подписаться за 799 ₽" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^1 месяц/ }));
    expect(screen.getByRole("button", { name: "Подписаться за 99 ₽" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /12 месяцев/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Или за 400/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_saved"));
    expect(calls.find((c) => c.key === "POST /api/premium/buy-with-stars")?.body).toEqual({ plan: "m12" });
  });

  it("карусель возможностей: открывается на выбранной, «Дальше» листает", async () => {
    fakeApi({ "GET /api/premium/me": { body: { ...PREMIUM, starsBalance: 0 } } });
    renderAt(<PremiumSection />);
    expect((await screen.findByRole("button", { name: /^Не хватает звёзд: нужно 400/ })).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Значок Premium Звезда у имени/ }));
    expect(screen.getByRole("heading", { name: "Значок Premium" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));
    expect(screen.getByRole("heading", { name: "Эксклюзивные реакции" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Подписаться на Shalter Premium" })).toBeTruthy();
  });
});
