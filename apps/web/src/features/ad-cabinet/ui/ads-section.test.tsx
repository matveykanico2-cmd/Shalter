import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { AdsSection } from "./ads-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PLACEMENTS = { chats: "Список чатов", chat: "В каналах — рекламное сообщение", discover: "Каталог каналов", profile: "Профиль" };

describe("«Реклама»", () => {
  it("новая кампания: места показа, отправка на проверку — карточка «На проверке»", async () => {
    let campaigns: unknown[] = [];
    const { calls } = fakeApi({
      "GET /api/ads/campaigns": () => ({ body: { campaigns, balanceStars: 1000, placements: PLACEMENTS, cpmMin: 5 } }),
      "GET /api/ads/me": { body: { isAdsActive: false, adsForever: false, adAttachments: [], priceRub: 300, days: 30 } },
      "POST /api/ads/campaigns": (body) => {
        campaigns = [{ id: "ad_1_a", ownerId: "u_me", title: body.title, text: body.text, url: body.url, imageUrl: null, placement: "discover,chat", placements: body.placements, status: "review", rejectReason: null, budgetStars: 0, spentStars: 0, cpmStars: 20, impressions: 0, clicks: 0, createdAt: "2026-10-26T10:00:00.000Z", updatedAt: null, remainingStars: 0 }];
        return { body: { campaign: campaigns[0] } };
      },
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <AdsSection />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText(/на балансе — из них и оплачивается показ/)).toBeTruthy();
    expect(screen.getByText("Купить кабинет рекламы на 30 дней — 300₽", { normalizer: (s) => s.replace(/\s+/g, " ").trim() })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Новая кампания" }));
    fireEvent.change(screen.getByPlaceholderText("Название — только для вас, например «Осенняя распродажа»"), { target: { value: "Распродажа" } });
    fireEvent.change(screen.getByPlaceholderText("Текст объявления — до 200 символов"), { target: { value: "Скидки" } });
    fireEvent.click(screen.getByRole("button", { name: "В каналах — рекламное сообщение" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать и отправить на проверку" }));
    expect(await screen.findByText("На проверке")).toBeTruthy();
    expect(screen.getByText("Каталог каналов · В каналах — рекламное сообщение")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/ads/campaigns")?.body).toMatchObject({ title: "Распродажа", placements: ["discover", "chat"], cpmStars: 20 });
  });
});
