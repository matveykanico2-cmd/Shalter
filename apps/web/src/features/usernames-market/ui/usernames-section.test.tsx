import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { UsernamesSection } from "./usernames-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const seller = { id: "u_boris0000", name: "Борис" };

describe("«Аукцион юзернеймов»", () => {
  it("рынок: покупка за звёзды — ник ваш, объявление исчезает", async () => {
    let sold = false;
    const { calls } = fakeApi({
      "GET /api/usernames": { body: { auctions: [], balance: 100, minStep: 1, isAdmin: false } },
      "GET /api/usernames/market": () => ({
        body: { balance: sold ? 57 : 100, listings: sold ? [] : [{ id: "ul_1_ab", username: "boris", sellerId: seller.id, priceStars: 43, status: "open", buyerId: null, soldAt: null, createdAt: "2026-10-26T10:00:00.000Z", seller, mine: false }] },
      }),
      "POST /api/usernames/market/ul_1_ab/buy": () => {
        sold = true;
        return { body: { ok: true, username: "boris", user: seller, balance: 57 } };
      },
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <UsernamesSection />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("Продавец: Борис")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Завершить сейчас" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Купить за 43/ }));
    expect(await screen.findByText(/@boris теперь ваш$/)).toBeTruthy();
    expect(screen.queryByText("@boris")).toBeNull();
    expect(calls.some((c) => c.key === "POST /api/usernames/market/ul_1_ab/buy")).toBe(true);
  });
});
