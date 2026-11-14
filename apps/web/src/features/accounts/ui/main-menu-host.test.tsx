import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { type SelfUser,sessionQueries } from "@/entities/session";
import { settingsQueries } from "@/entities/settings";

import { openMainMenu } from "../model/main-menu-store";

import { MainMenuHost } from "./main-menu-host";

const me = {
  id: "u_me0000000",
  name: "Матвей",
  username: "matvey",
  phone: "+70000000000",
  avatarColor: "#168acd",
  blockedUserIds: [],
  adminSections: [],
} as SelfUser;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: me, accounts: [me] });
  client.setQueryData(settingsQueries.current().queryKey, { theme: "light", reduceMotion: false });
  const router = createMemoryRouter([{ path: "*", element: <MainMenuHost me={me} /> }]);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

afterEach(cleanup);

describe("главное меню", () => {
  it.each([
    ["Добавить аккаунт", "/login?add=1"],
    ["Архив", "/archive"],
    ["Контакты", "/contacts"],
    ["Звонки", "/calls"],
    ["Настройки", "/settings"],
    ["Каталог каналов", "/discover-channels"],
  ])("%s открывается внутри SPA", async (label, path) => {
    const router = setup();
    openMainMenu({ x: 10, y: 10 });
    fireEvent.click(await screen.findByRole("button", { name: label }));
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(path);
  });

  it("показывает профиль, AI, избранное, тему, анимации и поддержку", async () => {
    setup();
    openMainMenu({ x: 10, y: 10 });
    for (const label of ["Мой профиль", "Shalter AI", "Избранное", "Включить тёмную тему", "Отключить анимации", "Скачать приложение", "Сообщить об ошибке"]) {
      expect(await screen.findByRole("button", { name: label })).toBeTruthy();
    }
  });
});
