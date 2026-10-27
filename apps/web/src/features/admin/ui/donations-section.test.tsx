import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { DonationsSection } from "./donations-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Донаты»", () => {
  it("DonatePay настроен, DonationAlerts — нет: подсказка про переменные сервера", async () => {
    fakeApi({ "GET /api/donation-alerts/status": { body: { configured: false, connected: false, username: null, donatePayConfigured: true } } });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <DonationsSection />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText(/^Настроен/)).toBeTruthy();
    expect(screen.getByText(/На сервере не заданы DONATIONALERTS_CLIENT_ID/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Подключить DonationAlerts" })).toBeNull();
  });
});
