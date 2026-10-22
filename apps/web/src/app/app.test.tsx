import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { App } from "./app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("вход и оболочка", () => {
  it("без сессии — экран входа", async () => {
    fakeApi({ "GET /api/auth/session": { body: { user: null, accounts: [] } } });
    window.history.replaceState(null, "", "/chat/c_abc");
    render(<App />);
    expect(await screen.findByText("Вход в Shalter")).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
  });

  it("с сессией — оболочка; /login уводит в приложение", async () => {
    fakeApi({ "GET /api/auth/session": { body: { user: { id: "u_test12345", name: "Аня" }, accounts: [] } } });
    window.history.replaceState(null, "", "/login");
    render(<App />);
    expect(await screen.findByText("Выберите чат")).toBeTruthy();
    expect(screen.getByTitle("Аня")).toBeTruthy();
    expect(window.location.pathname).toBe("/");
  });
});
