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

  it("профиль участника: вкладки участников, медиа, файлов и ссылок", async () => {
    fakeApi({
      "GET /api/communities/cm_city00000000": { body: { community: community({ isMember: true, role: "member", membersCount: 2 }) } },
      "GET /api/communities/cm_city00000000/members?q=": {
        body: { users: [{ id: "u_alice0000", name: "Алиса", username: "alice", avatarColor: null, avatarImage: null, avatarEmoji: null, online: true, role: "owner" }] },
      },
      "GET /api/communities/cm_city00000000/media": {
        body: {
          media: [{ chatId: "c_open", messageId: "m_image0000", createdAt: "2026-11-09T08:00:00.000Z", senderId: "u_alice0000", attachment: { kind: "image", url: "data:image/png;base64,AAAA" } }],
          files: [{ chatId: "c_open", messageId: "m_file00000", createdAt: "2026-11-09T08:00:00.000Z", senderId: "u_alice0000", attachment: { kind: "file", url: "data:text/plain;base64,AAAA", name: "plan.txt", size: 20 } }],
          links: [{ chatId: "c_open", messageId: "m_link00000", createdAt: "2026-11-09T08:00:00.000Z", text: "https://shalter.ru", linkPreview: { url: "https://shalter.ru", title: "Shalter" } }],
        },
      },
    });
    renderAt("cm_city00000000");
    await screen.findByRole("heading", { name: "Город" });

    fireEvent.click(screen.getByRole("tab", { name: "Участники" }));
    expect(await screen.findByText("Алиса")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Медиа" }));
    expect(await screen.findByRole("button", { name: "Фото" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Файлы" }));
    expect(await screen.findByText("plan.txt")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Ссылки" }));
    expect(await screen.findByText("Shalter")).toBeTruthy();
  });

  it("показывает ошибку общей медиатеки, а не сообщение о пустом разделе", async () => {
    fakeApi({
      "GET /api/communities/cm_city00000000": { body: { community: community({ isMember: true, role: "member" }) } },
      "GET /api/communities/cm_city00000000/media": { status: 500, body: { error: "Медиатека временно недоступна" } },
    });
    renderAt("cm_city00000000");
    await screen.findByRole("heading", { name: "Город" });

    fireEvent.click(screen.getByRole("tab", { name: "Медиа" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Медиатека временно недоступна");
    expect(screen.queryByText("Медиа пока нет")).toBeNull();
  });

  it("не монтирует сразу всю медиатеку", async () => {
    const media = Array.from({ length: 31 }, (_, index) => ({
      chatId: "c_open",
      messageId: `m_image_${index}`,
      createdAt: "2026-11-09T08:00:00.000Z",
      senderId: "u_alice0000",
      attachment: { kind: "image", url: `data:image/png;base64,${index}` },
    }));
    fakeApi({
      "GET /api/communities/cm_city00000000": { body: { community: community({ isMember: true, role: "member" }) } },
      "GET /api/communities/cm_city00000000/media": { body: { media, files: [], links: [] } },
    });
    renderAt("cm_city00000000");
    await screen.findByRole("heading", { name: "Город" });

    fireEvent.click(screen.getByRole("tab", { name: "Медиа" }));
    expect(await screen.findAllByRole("button", { name: "Фото" })).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Показать ещё" }));
    expect(screen.getAllByRole("button", { name: "Фото" })).toHaveLength(31);
  });
});
