import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { SignInForm } from "./sign-in-form";

const user = { id: "u_test12345", name: "Аня" };

function renderForm() {
  const onSignedIn = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SignInForm onSignedIn={onSignedIn} />
    </QueryClientProvider>
  );
  return { onSignedIn };
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Войти" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("вход по почте", () => {
  it("верный пароль — вошли; почта без пробелов по краям", async () => {
    const api = fakeApi({ "POST /api/auth/login-email": { body: { user, alreadyLinked: false } } });
    const { onSignedIn } = renderForm();
    fillAndSubmit("  anya@example.com ", "secret");
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(api.calls[0]).toEqual({ key: "POST /api/auth/login-email", body: { email: "anya@example.com", password: "secret" } });
  });

  it("ошибка — текст сервера", async () => {
    fakeApi({ "POST /api/auth/login-email": { status: 401, body: { error: "Неверная почта или пароль" } } });
    const { onSignedIn } = renderForm();
    fillAndSubmit("anya@example.com", "wrong");
    expect(await screen.findByText("Неверная почта или пароль")).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("с 2FA — второй шаг с кодом по билету", async () => {
    const ticket = "t".repeat(32);
    const api = fakeApi({
      "POST /api/auth/login-email": {
        body: { twoFactorRequired: true, ticket, expiresInSec: 300, name: "Аня", method: "totp", hint: null, scheduledDeletionAt: null },
      },
      "POST /api/auth/2fa/login": ({ code }) =>
        code === "123456" ? { body: { user, alreadyLinked: false } } : { status: 400, body: { error: "Неверный код" } },
    });
    const { onSignedIn } = renderForm();
    fillAndSubmit("anya@example.com", "secret");
    expect(await screen.findByText("Вход в аккаунт Аня защищён вторым фактором — введите текущий код.")).toBeTruthy();

    const code = screen.getByPlaceholderText("······");
    fireEvent.change(code, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить вход" }));
    expect(await screen.findByText("Неверный код")).toBeTruthy();
    expect((code as HTMLInputElement).value).toBe("");

    fireEvent.change(code, { target: { value: " 123456 " } });
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить вход" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(api.calls.at(-1)).toEqual({ key: "POST /api/auth/2fa/login", body: { ticket, code: "123456" } });
  });
});
