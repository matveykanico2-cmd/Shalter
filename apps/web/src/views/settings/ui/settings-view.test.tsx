import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";

import { SettingsView } from "./settings-view";

const ME = {
  id: "u_me0000000",
  name: "Аня",
  lastName: "",
  phone: "+79990000001",
  username: "anya",
  bio: "Люблю горы",
  avatarImages: [],
  profileTracks: [],
  profileTrack: null,
  statusIcon: null,
  statusName: null,
  isPremium: false,
  adminSections: [] as string[],
  blockedUserIds: [] as string[],
};
const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const SESSIONS = [
  { id: "sess_1", deviceId: "sess_1", device: "Chrome, macOS", location: "Москва", lastActive: at(0), current: true },
  { id: "sess_2", deviceId: "sess_2", device: "Firefox, Linux", location: "", lastActive: at(30), current: false },
];

function renderSettings(path: string, me: Record<string, unknown> = ME) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: me, accounts: [me] } as never);
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>Список чатов</p> },
      { path: "/settings", element: <SettingsView /> },
      { path: "/settings/:section", element: <SettingsView /> },
      { path: "/chat/:chatId", element: <p>чат</p> },
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { router, client };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Настройки»", () => {
  it("меню: профиль, разделы ссылками с числами, без администрирования; «Поддержка — Hugo» открывает чат", async () => {
    const { calls } = fakeApi({
      "GET /api/sessions": { body: { sessions: SESSIONS } },
      "GET /api/stars": { body: { balance: 77 } },
      "POST /api/support/chat": { body: { chatId: "c_hugo" } },
    });
    const { router } = renderSettings("/settings");
    expect(screen.getByRole("heading", { name: "Настройки" })).toBeTruthy();
    expect(screen.getByText("@anya")).toBeTruthy();
    expect(screen.getByText("Люблю горы")).toBeTruthy();
    expect(await screen.findByRole("link", { name: /^Устройства\s*2$/ })).toBeTruthy();
    expect(await screen.findByRole("link", { name: /^Звёзды\s*77$/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Конфиденциальность" }).getAttribute("href")).toBe("/settings/privacy");
    expect(screen.queryByText("Администрирование")).toBeNull();
    expect(screen.queryByRole("link", { name: "Модерация" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Поддержка — Hugo" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_hugo"));
    expect(calls.some((c) => c.key === "POST /api/support/chat")).toBe(true);
  });

  it("раздел администрирования без доступа — обратно в меню; с доступом — в меню и открывается", async () => {
    fakeApi({ "GET /api/sessions": { body: { sessions: [] } }, "GET /api/stars": { body: { balance: 0 } } });
    const { router } = renderSettings("/settings/moderation");
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    cleanup();

    renderSettings("/settings", { ...ME, adminSections: ["legal"] });
    expect(screen.getByText("Администрирование")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Запросы органов" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Модерация" })).toBeNull();
  });

  it("«Устройства»: сеанс → «Завершить сеанс» → подтверждение — строка пропадает", async () => {
    const { calls } = fakeApi({
      "GET /api/sessions": { body: { sessions: SESSIONS } },
      "DELETE /api/sessions/sess_2": { body: { ok: true } },
    });
    renderSettings("/settings/devices");
    expect(screen.getByRole("heading", { name: "Устройства" })).toBeTruthy();
    expect(await screen.findByText("Это устройство")).toBeTruthy();
    const row = await screen.findByRole("button", { name: /^Firefox.*Linux/ });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Завершить сеанс" }));
    expect(screen.getByText("Завершить сеанс?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Завершить" }));
    await waitFor(() => expect(screen.queryByText("Активные сеансы")).toBeNull());
    expect(calls.some((c) => c.key === "DELETE /api/sessions/sess_2")).toBe(true);
  });

  it("«Изменить профиль»: имя и «О себе» уходят на сервер, шапка меню — с новым именем", async () => {
    const { calls } = fakeApi({
      "PATCH /api/users/u_me0000000": (body) => ({ body: { user: { ...ME, ...body } } }),
      "GET /api/sessions": { body: { sessions: [] } },
      "GET /api/stars": { body: { balance: 0 } },
    });
    const { client } = renderSettings("/settings/profile");
    expect(screen.getByRole("heading", { name: "Изменить профиль" })).toBeTruthy();
    const name = await screen.findByRole("textbox", { name: "Имя" });
    expect((name as HTMLInputElement).value).toBe("Аня");
    fireEvent.change(name, { target: { value: "Анна" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^О себе/ }), { target: { value: "Люблю книги" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("button", { name: "Сохранено ✓" })).toBeTruthy();
    const patch = calls.find((c) => c.key === "PATCH /api/users/u_me0000000")?.body as Record<string, unknown>;
    expect(patch).toMatchObject({ name: "Анна", bio: "Люблю книги", username: "anya" });
    expect(client.getQueryData(sessionQueries.current().queryKey)?.user?.name).toBe("Анна");
  });

});
