import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionQueries } from "@/entities/session";
import { settingsQueries } from "@/entities/settings";

import { fakeApi } from "@/shared/lib/test";

import { AppearanceSection } from "./appearance-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Внешний вид» → «Формат времени»", () => {
  it("12 часов уходят в PATCH /api/settings", async () => {
    const settings = { theme: "system", fontSize: 16, accent: null, chatWallpaper: null, translateLanguage: "ru", uiLanguage: "ru", timeFormat: 24 };
    const api = fakeApi({ "PATCH /api/settings": ({ timeFormat }) => ({ body: { settings: { ...settings, timeFormat } } }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(sessionQueries.current().queryKey, { user: { id: "u_me0000001", name: "Я" } } as never);
    client.setQueryData(settingsQueries.current().queryKey, settings as never);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AppearanceSection />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const select = screen.getByRole("combobox", { name: "Формат времени" }) as HTMLSelectElement;
    expect(select.value).toBe("24");
    expect(screen.getByRole("option", { name: "12 часов (AM/PM)" })).toBeTruthy();
    fireEvent.change(select, { target: { value: "12" } });
    await waitFor(() => expect(api.calls.find((c) => c.key === "PATCH /api/settings")?.body).toEqual({ timeFormat: 12 }));
    expect(select.value).toBe("12");
  });
});
