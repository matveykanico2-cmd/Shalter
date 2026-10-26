import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionQueries } from "@/entities/session";
import { settingsQueries } from "@/entities/settings";

import { hasPasscode, removePasscode } from "@/shared/lib/passcode";
import { fakeApi } from "@/shared/lib/test";
import { useSettingsSubpageState } from "@/shared/ui";

import { PrivacySection } from "./privacy-section";

const ME = { id: "u_me0000000", name: "Аня", email: "anya@example.com", blockedUserIds: [] as string[] };
const PRIVACY = {
  lastSeen: "everyone",
  phone: "contacts",
  discoverByPhone: "everyone",
  photo: "everyone",
  bio: "everyone",
  birthday: "contacts",
  forwards: "everyone",
  invites: "everyone",
  calls: "everyone",
  botMessages: "everyone",
  storiesArchive: "contacts",
};
const SETTINGS = { privacy: PRIVACY, drafts: {}, requirePasswordOnLaunch: false };
const TWO_FA_OFF = { enabled: false, method: "totp", pending: false, cloudPasswordHint: "", recoveryCodesLeft: 0, enabledAt: null };

// jsdom не ставит пробел между строками заголовка и подписи — имена кнопок через \s*.
// Шапка SettingsView: заголовок подстраницы и «Назад».
function Header() {
  const sub = useSettingsSubpageState();
  return sub ? (
    <button type="button" onClick={sub.back}>
      Назад
    </button>
  ) : null;
}

function renderPrivacy() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: ME } as never);
  client.setQueryData(settingsQueries.current().queryKey, SETTINGS as never);
  const router = createMemoryRouter(
    [
      {
        path: "/settings/privacy",
        element: (
          <>
            <Header />
            <PrivacySection />
          </>
        ),
      },
    ],
    { initialEntries: ["/settings/privacy"] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const baseRoutes = () => ({
  "GET /api/auth/2fa": { body: TWO_FA_OFF },
  "GET /api/users/blocked": { body: { users: [] } },
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  removePasscode();
});

describe("«Конфиденциальность»", () => {
  it("правило: выбор уходит на сервер всем объектом privacy, «Назад» — к списку с новым значением", async () => {
    const api = fakeApi({
      ...baseRoutes(),
      "PATCH /api/settings": (body) => ({ body: { settings: { ...SETTINGS, ...body } } }),
    });
    renderPrivacy();
    fireEvent.click(screen.getByRole("button", { name: /^Номер телефона\s*Мои контакты$/ }));
    expect(screen.getByText("Кто видит мой номер телефона?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Никто" }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "PATCH /api/settings")).toBe(true));
    expect(api.calls.find((c) => c.key === "PATCH /api/settings")?.body).toEqual({ privacy: { ...PRIVACY, phone: "nobody" } });
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByRole("button", { name: /^Номер телефона\s*Никто$/ })).toBeTruthy();
  });

  it("код-пароль: короткий не принимается, затем повтор и «Вкл.»", async () => {
    fakeApi(baseRoutes());
    renderPrivacy();
    fireEvent.click(screen.getByRole("button", { name: /^Код-пароль\s*Выкл\.$/ }));
    const field = () => document.querySelector<HTMLInputElement>('input[type="password"]')!;
    fireEvent.change(field(), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByText("Минимум 4 цифры")).toBeTruthy();
    fireEvent.change(field(), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByText("Повторите код-пароль")).toBeTruthy();
    fireEvent.change(field(), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("button", { name: /^Код-пароль\s*Вкл\.$/ })).toBeTruthy();
    expect(hasPasscode()).toBe(true);
  });

  it("облачный пароль: проверки формы, затем включение и новый статус", async () => {
    let enabled = false;
    const api = fakeApi({
      ...baseRoutes(),
      "GET /api/auth/2fa": () => ({ body: enabled ? { ...TWO_FA_OFF, enabled: true, method: "password" } : TWO_FA_OFF }),
      "POST /api/auth/2fa/cloud-password": () => {
        enabled = true;
        return { body: { ok: true, enabled: true, method: "password", hint: null } };
      },
    });
    renderPrivacy();
    fireEvent.click(await screen.findByRole("button", { name: /^Двухэтапная аутентификация\s*Выкл\.$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Облачный пароль/ }));
    fireEvent.change(screen.getByLabelText("Облачный пароль"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Включить" }));
    expect(screen.getByText("Облачный пароль — не короче 6 знаков")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Облачный пароль"), { target: { value: "Гора-2026" } });
    fireEvent.change(screen.getByLabelText("Ещё раз"), { target: { value: "Гора-2026" } });
    fireEvent.change(screen.getByLabelText("Пароль от аккаунта"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Включить" }));
    expect(await screen.findByRole("button", { name: /^Двухэтапная аутентификация\s*Вкл\. · облачный пароль$/ })).toBeTruthy();
    expect(api.calls.find((c) => c.key === "POST /api/auth/2fa/cloud-password")?.body).toEqual({ password: "Гора-2026", hint: "", accountPassword: "secret" });
  });
});
