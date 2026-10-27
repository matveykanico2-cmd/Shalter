import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries } from "@/entities/chat";
import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";
import { Toaster } from "@/shared/ui";

import { CommunityView } from "./community-view";

const rights = { editInfo: false, editChats: false, ban: false, addAdmins: false };
const chat = (over: Record<string, unknown>) => ({
  id: "c_open",
  type: "group",
  title: "Открытый клуб",
  username: null,
  avatarColor: null,
  avatarImage: null,
  isPublic: true,
  approveJoins: false,
  members: 3,
  isMember: false,
  isChatAdmin: false,
  visible: true,
  addedBy: null,
  ...over,
});
const community = (over: Record<string, unknown> = {}) => ({
  id: "cm_city00000000",
  title: "Город",
  description: "Жители города",
  avatarColor: null,
  avatarImage: null,
  addMode: "all",
  role: null,
  isOwner: false,
  isMember: false,
  isBanned: false,
  rights,
  addPolicy: null,
  pinned: false,
  collapsed: false,
  chats: [chat({}), chat({ id: "c_closed", title: "Закрытый штаб", isPublic: false })],
  isClosed: false,
  membersCount: 1,
  adminsCount: 1,
  bannedCount: 0,
  requestsCount: 0,
  ...over,
});

function renderAt(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(chatQueries.list().queryKey, []);
  client.setQueryData(sessionQueries.current().queryKey, { user: { id: "u_me", name: "Борис", blockedUserIds: [] } } as never);
  const router = createMemoryRouter(
    [
      { path: "/community/:id", element: <CommunityView /> },
      { path: "/chat/:chatId", element: <p>чат</p> },
      { path: "/", element: <p>Список чатов</p> },
    ],
    { initialEntries: [`/community/${id}`] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("страница сообщества", () => {
  it("вступить в сообщество, затем в открытую группу", async () => {
    fakeApi({
      "GET /api/communities/cm_city00000000": { body: { community: community() } },
      "POST /api/communities/cm_city00000000/join": { body: { community: community({ isMember: true, membersCount: 2 }) } },
      "GET /api/communities/joined": { body: { communities: [] } },
      "POST /api/chats/c_open/join": { body: { chat: { id: "c_open" } } },
      "GET /api/chats": { body: { chats: [] } },
    });
    const router = renderAt("cm_city00000000");
    expect(await screen.findByRole("heading", { name: "Город" })).toBeTruthy();
    expect(screen.getByText("Сообщество · 2 чата · 1 участник")).toBeTruthy();
    expect(screen.getByText(/по приглашению/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Вступить в сообщество" }));
    expect(await screen.findByText("Вы вступили в сообщество")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Открыть в списке чатов" })).toBeTruthy();
    expect(screen.getByText("Сообщество · 2 чата · 2 участника")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Вступить" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_open"));
  });

  it("несуществующее — «Сообщество недоступно» и «К чатам»", async () => {
    fakeApi({ "GET /api/communities/cm_nope000000": { status: 404, body: { error: "Сообщество не найдено" } } });
    const router = renderAt("cm_nope000000");
    expect(await screen.findByRole("heading", { name: "Сообщество недоступно" })).toBeTruthy();
    expect(screen.getByText("Сообщество не найдено")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "К чатам" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
