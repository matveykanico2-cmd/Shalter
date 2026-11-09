import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { SignInForm } from "./sign-in-form";

const user = { id: "u_test12345", name: "Аня" };

function renderForm({ more = false } = {}) {
  const onSignedIn = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SignInForm onSignedIn={onSignedIn} />
    </QueryClientProvider>
  );
  if (more) fireEvent.click(screen.getByRole("button", { name: /Другие способы входа/ }));
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

describe("регистрация", () => {
  it("почта и пароль — аккаунт создан, затем данные профиля, вошли", async () => {
    const created = { ...user, name: "Regina", username: "regina_123" };
    const api = fakeApi({
      "POST /api/auth/register-email": { body: { user: created } },
      "GET /api/auth/username-available?u=regina": { body: { username: "regina", available: true, error: null } },
      "PATCH /api/users/u_test12345": { body: { user: { ...created, name: "Регина", username: "regina" } } },
    });
    const { onSignedIn } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }));
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: " regina@example.com " } });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    expect(await screen.findByText(/Аккаунт создан/)).toBeTruthy();
    expect(api.calls[0]).toEqual({ key: "POST /api/auth/register-email", body: { email: "regina@example.com", password: "secret123" } });
    expect(onSignedIn).not.toHaveBeenCalled();

    // Имя и юзернейм уже придуманы сервером — их можно поменять.
    expect((screen.getByPlaceholderText("Имя") as HTMLInputElement).value).toBe("Regina");
    expect((screen.getByPlaceholderText("юзернейм") as HTMLInputElement).value).toBe("regina_123");
    expect(screen.getByRole("combobox", { name: "День рождения" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Месяц рождения" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Год рождения" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Имя"), { target: { value: "Регина" } });
    fireEvent.change(screen.getByPlaceholderText("юзернейм"), { target: { value: "@regina!" } });
    expect((screen.getByPlaceholderText("юзернейм") as HTMLInputElement).value).toBe("regina");
    expect(await screen.findByText("Свободен ✓", {}, { timeout: 2000 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ name: "Регина", username: "regina" })));
    expect(api.calls.at(-1)).toEqual({ key: "PATCH /api/users/u_test12345", body: { name: "Регина", username: "regina" } });
  });

  it("второй шаг можно пропустить", async () => {
    const api = fakeApi({ "POST /api/auth/register-email": { body: { user } } });
    const { onSignedIn } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }));
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "a@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    expect(await screen.findByText("Пароль должен быть не короче 6 символов")).toBeTruthy();
    expect(api.calls).toEqual([]);
    fireEvent.change(screen.getByPlaceholderText("Пароль"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
    fireEvent.click(await screen.findByRole("button", { name: "Пропустить" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ id: user.id })));
    expect(api.calls).toHaveLength(1);
  });

  it("вход по коду: телефон → код из сообщения", async () => {
    const api = fakeApi({
      "POST /api/auth/code/start": { body: { ok: true } },
      "POST /api/auth/code/verify": { body: { user, alreadyLinked: false } },
    });
    const { onSignedIn } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: /Другие способы входа/ }));
    fireEvent.click(screen.getByRole("button", { name: /Войти по коду из сообщения/ }));
    fireEvent.change(screen.getByPlaceholderText("999 123 45 67"), { target: { value: "+79991234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить код" }));
    expect(await screen.findByText("Код отправлен в чат Shalter для номера +79991234567.")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("······"), { target: { value: "12-34-56" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(api.calls.at(-1)).toEqual({ key: "POST /api/auth/code/verify", body: { phone: "+79991234567", code: "123456" } });
  });
});


describe("гостевой вход", () => {
  it("«Продолжить как гость» — POST /api/auth/guest, «Входим…», вошли как после пароля", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(`${init?.method} ${String(input)}`).toBe("POST /api/auth/guest");
      expect(JSON.parse(String(init?.body))).toEqual({});
      await gate;
      return new Response(JSON.stringify({ user: { ...user, isGuest: true }, alreadyLinked: false }), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onSignedIn } = renderForm({ more: true });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить как гость" }));
    expect(((await screen.findByRole("button", { name: "Входим…" })) as HTMLButtonElement).disabled).toBe(true);
    release();
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ id: user.id, isGuest: true })));
  });

  it("имя гостя уходит на сервер", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ name: "Вася" });
      return new Response(JSON.stringify({ user: { ...user, name: "Вася", isGuest: true }, alreadyLinked: false }), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onSignedIn } = renderForm({ more: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Имя гостя" }), { target: { value: "  Вася " } });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить как гость" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ name: "Вася", isGuest: true })));
  });

  it("гостевой режим отключён — ошибка сервера, как у остальных способов входа", async () => {
    fakeApi({ "POST /api/auth/guest": { status: 404, body: { error: "Гостевой режим отключён" } } });
    const { onSignedIn } = renderForm({ more: true });
    fireEvent.click(screen.getByRole("button", { name: "Продолжить как гость" }));
    expect(await screen.findByText("Гостевой режим отключён")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Продолжить как гость" })).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});
