import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { chatQueries } from "@/entities/chat";
import { sessionQueries } from "@/entities/session";
import { closeUserProfile, openUserProfile } from "@/entities/user";

import { fakeApi } from "@/shared/lib/test";
import { AskHost, Toaster } from "@/shared/ui";

import { UserProfileHost } from "./user-profile-host";

const ME = { id: "u_me0000000", name: "Аня", username: "anya", blockedUserIds: [] as string[], adminSections: [] as string[] };
const BORIS = {
  id: "u_boris0000",
  name: "Борис",
  username: "boris",
  bio: "Играю на виолончели",
  online: false,
  isPremium: true,
  isAdsActive: false,
  isBusiness: false,
  isBanned: false,
  giftsReceived: [],
  avatarImages: [],
  adAttachments: [],
  profileTracks: [],
  profileTrack: null,
  statusIcon: null,
  statusName: null,
  profileName: "Борис",
};
const profile = (patch = {}) => ({ user: BORIS, isContact: false, inContacts: false, contactName: null, contactNote: null, commonGroupsCount: 0, pinnedChannels: [], ...patch });

function renderHost(me = ME) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: me } as never);
  client.setQueryData(chatQueries.list().queryKey, []);
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <UserProfileHost />
          </>
        ),
        children: [
          { path: "/", element: <p>Список чатов</p> },
          { path: "/chat/:chatId", element: <p>Открытый чат</p> },
        ],
      },
    ],
    { initialEntries: ["/"] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <AskHost />
      <Toaster />
    </QueryClientProvider>
  );
  return { client, router };
}

afterEach(() => {
  closeUserProfile();
  cleanup();
});

describe("профиль человека", () => {
  it("сведения, «Написать» открывает личку и закрывает панель", async () => {
    const { calls } = fakeApi({
      "GET /api/users/u_boris0000": { body: profile() },
      "POST /api/chats": { body: { chat: { id: "c_dm", type: "dm" } } },
      "GET /api/chats": { body: { chats: [] } },
    });
    const { router } = renderHost();
    act(() => openUserProfile(BORIS.id));
    const panel = await screen.findByRole("complementary", { name: "Профиль" });
    expect(await within(panel).findByText("Играю на виолончели")).toBeTruthy();
    expect(within(panel).getByText("@boris")).toBeTruthy();
    expect(within(panel).getByText("Имя в профиле: Борис")).toBeTruthy();
    expect(within(panel).getByTitle("Shalter Premium")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Звонок" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: /Добавить в контакты/ })).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Написать" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_dm"));
    expect(calls.find((c) => c.key === "POST /api/chats")?.body).toMatchObject({ userId: BORIS.id, title: "Борис" });
    expect(screen.queryByRole("complementary", { name: "Профиль" })).toBeNull();
  });

  it("блокировка прячет звонки, разблокировка возвращает; Escape закрывает", async () => {
    const { calls } = fakeApi({
      "GET /api/users/u_boris0000": { body: profile() },
      "POST /api/users/u_boris0000/block": { body: { user: null } },
    });
    const { client } = renderHost({ ...ME, blockedUserIds: [BORIS.id] });
    act(() => openUserProfile(BORIS.id));
    const panel = await screen.findByRole("complementary", { name: "Профиль" });
    fireEvent.click(await within(panel).findByRole("button", { name: /Разблокировать/ }));
    expect(await within(panel).findByRole("button", { name: /Заблокировать/ })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Звонок" })).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/users/u_boris0000/block")?.body).toEqual({ blocked: false });
    expect(client.getQueryData(sessionQueries.current().queryKey)?.user?.blockedUserIds).toEqual([]);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Профиль" })).toBeNull());
  });

  it("секретный чат — после подтверждения открывается новый чат", async () => {
    const { calls } = fakeApi({
      "GET /api/users/u_boris0000": { body: profile() },
      "POST /api/chats/secret": { body: { chat: { id: "c_secret", type: "dm" } } },
      "GET /api/chats": { body: { chats: [] } },
    });
    const { router } = renderHost();
    act(() => openUserProfile(BORIS.id));
    fireEvent.click(await screen.findByRole("button", { name: /Начать секретный чат/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Начать" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_secret"));
    expect(calls.find((c) => c.key === "POST /api/chats/secret")?.body).toEqual({ userId: BORIS.id });
  });

  it("свой профиль: «Так ваш профиль видят другие», QR-код, без действий с контактом", async () => {
    fakeApi({ "GET /api/users/u_me0000000": { body: profile({ user: { ...BORIS, id: ME.id, name: "Аня", username: "anya", profileName: undefined } }) } });
    renderHost();
    act(() => openUserProfile(ME.id));
    const panel = await screen.findByRole("complementary", { name: "Профиль" });
    expect(await within(panel).findByText("Так ваш профиль видят другие")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: /Заблокировать/ })).toBeNull();
    expect(within(panel).getByText("Закрепите свои публичные каналы — их увидит каждый, кто откроет ваш профиль.")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "QR-код" }));
    expect(await screen.findByRole("dialog", { name: "QR-код" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Скопировать ссылку" })).toBeTruthy();
  });
});
