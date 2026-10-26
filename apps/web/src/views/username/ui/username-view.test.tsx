import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries, type ChatSummary } from "@/entities/chat";
import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";
import { Toaster } from "@/shared/ui";

import { UsernameView } from "./username-view";

const ME = { id: "u_me0000000", name: "Аня", username: "anya", blockedUserIds: [] as string[] };
const LENA = { id: "u_lena00000", name: "Лена", username: "lena", online: false, isPremium: false };

const chat = (patch: Partial<ChatSummary>) => ({ type: "group", title: "", memberIds: [], adminIds: [], otherUser: null, ...patch }) as ChatSummary;

function ChatStub() {
  const location = useLocation();
  return <p>{`чат ${location.pathname}${location.search}${(location.state as { info?: boolean } | null)?.info ? " с профилем" : ""}`}</p>;
}

function renderAt(path: string, chats: ChatSummary[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: ME } as never);
  client.setQueryData(chatQueries.list().queryKey, chats);
  const router = createMemoryRouter(
    [
      { path: "/u/:username", element: <UsernameView /> },
      { path: "/chat/:chatId", element: <ChatStub /> },
      { path: "/", element: <p>Список чатов</p> },
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
  return router;
}

const profile = { user: LENA, isContact: false, inContacts: false, contactName: null, contactNote: null, commonGroupsCount: 0, pinnedChannels: [] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ссылка /u/имя", () => {
  it("свой ник — «Избранное»", async () => {
    fakeApi({});
    renderAt("/u/Anya", [chat({ id: "c_saved", type: "dm", isSaved: true })]);
    expect(await screen.findByText("чат /chat/c_saved")).toBeTruthy();
  });

  it("человек с личкой — личка с профилем; без лички — профиль поверх", async () => {
    fakeApi({ "GET /api/users/by-username/lena": { body: { user: LENA } }, "GET /api/users/u_lena00000": { body: profile } });
    renderAt("/u/lena", [chat({ id: "c_dm", type: "dm", otherUser: LENA as ChatSummary["otherUser"] })]);
    expect(await screen.findByText("чат /chat/c_dm с профилем")).toBeTruthy();
    cleanup();

    renderAt("/u/lena");
    expect(await screen.findByRole("dialog", { name: "Профиль" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Написать сообщение" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(await screen.findByText("Список чатов")).toBeTruthy();
  });

  it("бот по ссылке ?start= — чат с ним и /start с параметром", async () => {
    const bot = { ...LENA, id: "u_bot000000", name: "Погода", username: "weather_bot", isBot: true };
    const dm = chat({ id: "c_bot", type: "dm", otherUser: bot as ChatSummary["otherUser"] });
    const { calls } = fakeApi({
      "GET /api/users/by-username/weather_bot": { body: { user: bot } },
      "POST /api/chats": { body: { chat: dm } },
      "POST /api/chats/c_bot/messages": { body: { message: {} } },
      "GET /api/chats": { body: { chats: [dm] } },
    });
    renderAt("/u/weather_bot?start=moscow");
    expect(await screen.findByText("чат /chat/c_bot")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/chats/c_bot/messages")?.body).toEqual({ text: "/start moscow" });
    expect(calls.filter((c) => c.key === "POST /api/chats")).toHaveLength(1);
  });

  it("канал, где вы не подписаны, — превью с «Подписаться», затем сам канал с ?msg", async () => {
    const found = { id: "c_news", type: "channel", title: "Новости", description: "Главное за день", isVerified: false, subscribers: 5, isMember: false, banned: false, approveJoins: false, requestPending: false };
    const post = { id: "m_1", chatId: "c_news", senderId: "u_admin00000", type: "text", text: "Первый пост", createdAt: "2026-10-20T10:00:00.000Z", pinned: false, replyToId: null, reactions: [], readByIds: [], deletedForIds: [], mentionedUserIds: [], views: 3 };
    const { calls } = fakeApi({
      "GET /api/users/by-username/news": { status: 404, body: { error: "not found" } },
      "GET /api/chats/by-username/news": { body: { chat: found } },
      "GET /api/chats/c_news/preview": { body: { chat: { ...found, type: "channel" }, messages: [post], senders: [], hasMore: false } },
      "POST /api/chats/c_news/join": { body: { chat: { id: "c_news" } } },
      "GET /api/chats": { body: { chats: [] } },
    });
    renderAt("/u/news?msg=m_1");
    expect(await screen.findByText("Первый пост")).toBeTruthy();
    expect(screen.getByText("Главное за день")).toBeTruthy();
    expect(screen.getByText("5 подписчиков")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ПОДПИСАТЬСЯ" }));
    expect(await screen.findByText("чат /chat/c_news?msg=m_1")).toBeTruthy();
    expect(calls.some((c) => c.key === "POST /api/chats/c_news/join")).toBe(true);
  });

  it("группа с одобрением — заявка; никого — «Ничего не найдено»", async () => {
    const found = { id: "c_club", type: "group", title: "Клуб", description: null, isVerified: false, subscribers: 2, isMember: false, banned: false, approveJoins: true, requestPending: false };
    fakeApi({
      "GET /api/chats/by-username/club": { body: { chat: found } },
      "GET /api/chats/c_club/preview": { body: { chat: found, messages: [], senders: [], hasMore: false } },
      "POST /api/chats/c_club/join": { body: { pending: true } },
    });
    renderAt("/u/club");
    fireEvent.click(await screen.findByRole("button", { name: "ПОДАТЬ ЗАЯВКУ" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "ЗАЯВКА ОТПРАВЛЕНА" })).toHaveProperty("disabled", true));
    expect(screen.getByText("Заявка на вступление в группу отправлена")).toBeTruthy();
    cleanup();

    fakeApi({});
    renderAt("/u/nobody");
    expect(await screen.findByText("Ничего не найдено")).toBeTruthy();
    expect(screen.getByText("@nobody — такого аккаунта, бота или канала нет.")).toBeTruthy();
  });
});
