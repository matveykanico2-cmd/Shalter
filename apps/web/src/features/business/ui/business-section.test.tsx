import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { settingsQueries } from "@/entities/settings";

import { fakeApi } from "@/shared/lib/test";

import { BusinessSection } from "./business-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const day = (closed = false) => ({ closed, open: "09:00", close: "18:00" });
const BUSINESS = {
  enabled: true,
  hours: { mon: day(), tue: day(), wed: day(), thu: day(), fri: day(), sat: day(true), sun: day(true) },
  timeZone: "Europe/Moscow",
  showHours: true,
  greeting: { enabled: false, text: "", attachments: [] },
  away: { enabled: false, text: "", attachments: [] },
  quickReplies: [],
};
const PLANS = { m1: { days: 30, priceRub: 199, label: "1 месяц" }, m12: { days: 360, priceRub: 1599, label: "12 месяцев" } };

function renderSection(me: object) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(settingsQueries.current().queryKey, { business: BUSINESS } as never);
  const api = fakeApi({
    "GET /api/business/me": { body: { isBusiness: false, businessForever: false, businessAddress: null, businessLat: null, businessLng: null, isAdmin: false, plans: PLANS, business: BUSINESS, ...me } },
    "PATCH /api/settings": (body) => ({ body: { settings: body } }),
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BusinessSection />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return api;
}

describe("«Shalter для бизнеса»", () => {
  it("без подписки — тарифы и что входит", async () => {
    renderSection({});
    expect(await screen.findByRole("heading", { name: "Shalter для бизнеса" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Подключить за 1599 ₽" })).toBeTruthy();
    expect(screen.getByText("Быстрые ответы")).toBeTruthy();
  });

  it("с подпиской: пресет часов работы сохраняется целиком в настройках", async () => {
    const { calls } = renderSection({ isBusiness: true, businessForever: true });
    expect(await screen.findByRole("heading", { name: "У вас Shalter для бизнеса" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Каждый день 10–22" }));
    await waitFor(() => expect(calls.some((c) => c.key === "PATCH /api/settings")).toBe(true));
    const patch = calls.find((c) => c.key === "PATCH /api/settings")!.body as { business: typeof BUSINESS };
    expect(patch.business.hours.sun).toEqual({ closed: false, open: "10:00", close: "22:00" });
    expect(patch.business.timeZone).toBe("Europe/Moscow");
  });
});
