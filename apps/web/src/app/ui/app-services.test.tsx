import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ws } from "@/shared/api";
import { removePasscode, setPasscode } from "@/shared/lib/passcode";
import { fakeApi, fakeSocket } from "@/shared/lib/test";

import { App } from "../app";

const ME = { id: "u_test12345", name: "Аня" };
const session = { body: { user: ME, accounts: [] } };

beforeEach(() => {
  fakeSocket();
  localStorage.setItem("shalter.permissionsAsked", "1");
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(380);
});

afterEach(() => {
  ws.stop();
  cleanup();
  removePasscode();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("экраны блокировки", () => {
  it("код-пароль этого устройства: неверный — ошибка, верный — приложение", async () => {
    await setPasscode("2468");
    fakeApi({ "GET /api/auth/session": session, "GET /api/bootstrap": { body: { settings: {}, chats: [], folders: [], contactIds: [] } } });
    render(<App />);
    expect(await screen.findByText("Shalter заблокирован")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Чаты" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Код-пароль"), { target: { value: "1111" } });
    fireEvent.click(screen.getByRole("button", { name: "Разблокировать" }));
    expect(await screen.findByText("Неверный код-пароль")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Код-пароль"), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: "Разблокировать" }));
    expect(await screen.findByRole("link", { name: "Чаты" })).toBeTruthy();
    expect(screen.queryByText("Shalter заблокирован")).toBeNull();
  });

  it("«Пароль при запуске»: пароль от аккаунта проверяет сервер", async () => {
    const api = fakeApi({
      "GET /api/auth/session": session,
      "GET /api/bootstrap": { body: { settings: { requirePasswordOnLaunch: true }, chats: [], folders: [], contactIds: [] } },
      "POST /api/auth/verify-password": ({ password }) => (password === "secret" ? { body: { ok: true } } : { status: 401, body: { error: "Неверный пароль" } }),
    });
    render(<App />);
    expect(await screen.findByText("Приложение защищено паролем от аккаунта")).toBeTruthy();
    const input = screen.getByPlaceholderText("Пароль");
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByText("Неверный пароль")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");

    fireEvent.change(input, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByRole("link", { name: "Чаты" })).toBeTruthy();
    expect(api.calls.filter((c) => c.key === "POST /api/auth/verify-password").map((c) => c.body)).toEqual([{ password: "wrong" }, { password: "secret" }]);
  });
});
