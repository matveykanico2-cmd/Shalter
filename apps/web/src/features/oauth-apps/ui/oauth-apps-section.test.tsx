import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { OAuthAppsSection } from "./oauth-apps-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const APP = { id: "oa_1_abcdef12", name: "Мой магазин", clientId: "c".repeat(24), redirectUri: "https://shop.example/cb", ownerId: "u_me", createdAt: "2026-10-26T10:00:00.000Z" };

describe("«Войти через Shalter»", () => {
  it("ошибка адреса на форме; создание — окно с ключом и приложение в списке", async () => {
    fakeApi({
      "GET /api/oauth/apps": { body: { apps: [] } },
      "POST /api/oauth/apps": (body) =>
        String(body.redirectUri).startsWith("https://")
          ? { body: { app: { ...APP, clientSecret: "s".repeat(48) } } }
          : { status: 400, body: { error: "redirect_uri должен быть https:// (кроме localhost для разработки)" } },
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OAuthAppsSection />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText("Ваши приложения — 0")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Название приложения"), { target: { value: "Мой магазин" } });
    fireEvent.change(screen.getByPlaceholderText("https://ваш-сайт.example/callback"), { target: { value: "http://shop.example/cb" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать приложение" }));
    expect(await screen.findByText("redirect_uri должен быть https:// (кроме localhost для разработки)")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("https://ваш-сайт.example/callback"), { target: { value: APP.redirectUri } });
    fireEvent.click(screen.getByRole("button", { name: "Создать приложение" }));
    const dialog = await screen.findByRole("dialog", { name: "Ключ приложения «Мой магазин»" });
    expect(within(dialog).getByText(`client_secret: ${"s".repeat(48)}`)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Готово" }));
    expect(screen.getByText("Ваши приложения — 1")).toBeTruthy();
    expect(screen.getByText(APP.redirectUri)).toBeTruthy();
  });
});
