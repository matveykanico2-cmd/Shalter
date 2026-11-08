import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";

import { ExchangeSection } from "./exchange-section";

const coin = {
  id: "coin_shalter01",
  symbol: "SHT",
  name: "Shalter Coin",
  description: "Тестовая монета",
  color: "#2aabee",
  currentRate: 12.5,
  changePercent: 25,
  createdBy: "u_creator01",
  createdAt: "2026-11-08T12:00:00.000Z",
  updatedAt: "2026-11-08T13:00:00.000Z",
  history: [
    { rate: 10, createdAt: "2026-11-08T12:00:00.000Z" },
    { rate: 12.5, createdAt: "2026-11-08T13:00:00.000Z" },
  ],
};

function renderExchange(permissions = { isAdmin: false, canCreate: false }, userId = "u_viewer001") {
  fakeApi({ "GET /api/exchange": { body: { coins: [coin], permissions } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: { id: userId, name: "Пользователь" } } as never);
  render(<QueryClientProvider client={client}><ExchangeSection /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("биржа монет", () => {
  it("показывает котировки и график без элементов покупки", async () => {
    renderExchange();
    expect(await screen.findByText("Shalter Coin")).toBeTruthy();
    expect(screen.getByRole("img", { name: "График курса SHT" })).toBeTruthy();
    expect(screen.getByText("+25.00%")).toBeTruthy();
    expect(screen.getByText("Торговля недоступна")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /купить/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Изменить курс" })).toBeNull();
  });

  it("показывает управление только администратору", async () => {
    fakeApi({
      "GET /api/exchange": { body: { coins: [coin], permissions: { isAdmin: true, canCreate: true } } },
      "GET /api/exchange/creators": { body: { creators: [] } },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(sessionQueries.current().queryKey, { user: { id: "u_admin0001", name: "Админ" } } as never);
    render(<QueryClientProvider client={client}><ExchangeSection /></QueryClientProvider>);
    expect(await screen.findByRole("button", { name: "Создать монету" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Изменить курс" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Выдать право" })).toBeTruthy();
  });
});
