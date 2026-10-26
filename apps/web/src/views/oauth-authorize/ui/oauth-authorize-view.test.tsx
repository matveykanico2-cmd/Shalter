import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { OAuthAuthorizeView } from "./oauth-authorize-view";

const REDIRECT = "https://partner.example/cb";
const ME = { id: "u_test12345", name: "Алиса", username: "alice" };

function renderAt(search: string) {
  window.history.replaceState(null, "", `/oauth/authorize?${search}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <OAuthAuthorizeView />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("экран согласия OAuth", () => {
  it("со входом: приложение, аккаунт и «Разрешить» с state", async () => {
    const api = fakeApi({
      "GET /api/auth/session": { body: { user: ME, accounts: [] } },
      [`GET /api/oauth/app-info?client_id=abc&redirect_uri=${encodeURIComponent(REDIRECT)}`]: { body: { name: "Книжный клуб" } },
      "POST /api/oauth/authorize": { status: 400, body: { error: "Приложение отключено" } },
    });
    renderAt(new URLSearchParams({ client_id: "abc", redirect_uri: REDIRECT, state: "st-42" }).toString());
    expect(await screen.findByText("«Книжный клуб» хочет войти через Shalter")).toBeTruthy();
    expect(screen.getByText("@alice")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Разрешить" }));
    expect(await screen.findByText("Приложение отключено")).toBeTruthy();
    expect(api.calls.at(-1)).toEqual({ key: "POST /api/oauth/authorize", body: { client_id: "abc", redirect_uri: REDIRECT, state: "st-42" } });
  });

  it("без входа — форма входа на месте; неполная ссылка — пояснение", async () => {
    fakeApi({
      "GET /api/auth/session": { body: { user: null, accounts: [] } },
      [`GET /api/oauth/app-info?client_id=abc&redirect_uri=${encodeURIComponent(REDIRECT)}`]: { body: { name: "Кинотеатр" } },
    });
    renderAt(new URLSearchParams({ client_id: "abc", redirect_uri: REDIRECT }).toString());
    expect(await screen.findByText("Чтобы войти в «Кинотеатр» через Shalter, сначала войдите в свой аккаунт.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Войти" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Войти по QR-коду/ })).toBeNull();
    cleanup();

    renderAt("client_id=abc");
    expect(await screen.findByText("Ссылка неполная — не хватает client_id или redirect_uri.")).toBeTruthy();
  });
});
