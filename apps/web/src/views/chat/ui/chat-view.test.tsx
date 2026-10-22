import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatQueries, type ChatSummary } from "@/entities/chat";
import type { Message } from "@/entities/message";
import { sessionQueries } from "@/entities/session";

import { ws } from "@/shared/api";
import { fakeApi, FakeSocket, fakeSocket } from "@/shared/lib/test";

import { ChatView } from "./chat-view";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[] };
const LENA = { id: "u_lena00000", name: "Лена", avatarColor: "#f00" };
const HISTORY = "GET /api/chats/c_1/messages?limit=60";

function chat(patch: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: "c_1",
    type: "group",
    title: "Семья",
    adminIds: [],
    moderatorIds: [],
    ownerIds: [],
    memberIds: [ME.id, LENA.id],
    restrictions: {},
    archived: false,
    pinned: false,
    muted: false,
    mutedUntil: null,
    createdAt: "2026-10-01T10:00:00.000Z",
    lastMessage: null,
    unreadCount: 2,
    hasUnreadMention: false,
    otherUser: null,
    draft: null,
    ...patch,
  } as ChatSummary;
}

let seq = 0;
function msg(text: string, patch: Partial<Message> = {}): Message {
  seq += 1;
  return {
    id: `m_${seq}`,
    chatId: "c_1",
    senderId: LENA.id,
    type: "text",
    text,
    createdAt: new Date(Date.UTC(2026, 9, 22, 10, seq)).toISOString(),
    pinned: false,
    replyToId: null,
    reactions: [],
    readByIds: [],
    deletedForIds: [],
    mentionedUserIds: [],
    views: null,
    ...patch,
  };
}

const page = (messages: Message[], patch = {}) => ({ body: { messages, hasMore: false, firstUnreadId: null, replyTargets: {}, ...patch } });

function renderChat(c: ChatSummary = chat()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: ME } as never);
  client.setQueryData(chatQueries.list().queryKey, [c]);
  const router = createMemoryRouter([{ path: "/chat/:chatId", element: <ChatView /> }], { initialEntries: [`/chat/${c.id}`] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { client };
}

const bubbles = () => [...document.querySelectorAll("[data-message-id]")].map((el) => el.getAttribute("data-message-id"));
const card = (c: ChatSummary = chat()) => ({ body: { chat: c, members: [ME, LENA], commands: null, paidMessages: null } });

beforeEach(() => {
  seq = 0;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
  fakeSocket();
});

afterEach(() => {
  ws.stop();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("открытый чат", () => {
  it("история с плашками, автором, ответом; счётчик в списке гаснет", async () => {
    const first = msg("Привет **всем**");
    const reply = msg("и тебе", { senderId: ME.id, replyToId: first.id, readByIds: [ME.id, LENA.id] });
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([first, reply], { firstUnreadId: first.id }) });
    const { client } = renderChat();

    expect(await screen.findByText("всем")).toBeTruthy();
    expect(screen.getByText("Непрочитанные сообщения")).toBeTruthy();
    // Имя автора в группе берём из участников, у своего — нет.
    expect(await screen.findAllByText("Лена")).toHaveLength(2);
    const mine = document.querySelector(`[data-message-id="${reply.id}"]`)!;
    expect(within(mine as HTMLElement).getByLabelText("Прочитано")).toBeTruthy();
    expect(within(mine as HTMLElement).getByRole("button", { name: /Лена/ })).toBeTruthy();
    await waitFor(() => expect(client.getQueryData(chatQueries.list().queryKey)?.[0]?.unreadCount).toBe(0));
  });

  it("отправка: временный пузырь, затем настоящее сообщение и сверка", async () => {
    let onServer = [msg("старое")];
    const sent = msg("новое", { senderId: ME.id });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: () => page(onServer),
      "POST /api/chats/c_1/messages": () => {
        onServer = [...onServer, sent];
        return { body: { message: sent } };
      },
      "POST /api/chats/c_1/draft": { body: { ok: true } },
      "POST /api/chats/c_1/typing": { body: { ok: true } },
    });
    renderChat();
    await screen.findByText("старое");

    const input = screen.getByRole("textbox", { name: "Сообщение" });
    fireEvent.change(input, { target: { value: "новое" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect((input as HTMLTextAreaElement).value).toBe("");
    await waitFor(() => expect(bubbles()).toEqual(["m_1", sent.id]));
    const send = calls.find((c) => c.key === "POST /api/chats/c_1/messages")!;
    expect(send.body).toMatchObject({ text: "новое", replyToId: null });
    expect(String((send.body as { clientId: string }).clientId)).toMatch(/^local_/);
    await waitFor(() => expect(calls.filter((c) => c.key === HISTORY).length).toBeGreaterThan(1));
  });

  it("ответ на сообщение уходит с replyToId; ошибка возвращает текст в поле", async () => {
    const first = msg("вопрос");
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([first]),
      "POST /api/chats/c_1/messages": { status: 403, body: { error: "Вам запрещено писать в этом чате" } },
      "POST /api/chats/c_1/draft": { body: { ok: true } },
      "POST /api/chats/c_1/typing": { body: { ok: true } },
    });
    renderChat();
    await screen.findByText("вопрос");

    fireEvent.click(screen.getByTitle("Ответить"));
    expect(screen.getByText("Ответ Лена")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Сообщение" });
    fireEvent.change(input, { target: { value: "ответ" } });
    fireEvent.click(screen.getByTitle("Отправить"));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Вам запрещено писать в этом чате");
    expect((input as HTMLTextAreaElement).value).toBe("ответ");
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({ replyToId: first.id });
    expect(bubbles()).toEqual([first.id]);
  });

  it("события сокета: новое сразу в ленте, правка, удаление, прочтение", async () => {
    const mine = msg("моё", { senderId: ME.id, readByIds: [ME.id] });
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([mine]) });
    renderChat();
    ws.start();
    act(() => FakeSocket.last().open());
    await screen.findByText("моё");
    const socket = FakeSocket.last();

    const live = msg("живое");
    act(() => socket.receive({ type: "message:new", chatId: "c_1", message: live }));
    expect(await screen.findByText("живое")).toBeTruthy();

    act(() => socket.receive({ type: "message:updated", chatId: "c_1", message: { ...live, text: "исправлено", editedAt: live.createdAt } }));
    expect(await screen.findByText("исправлено")).toBeTruthy();
    expect(screen.getByText("изменено")).toBeTruthy();

    act(() => socket.receive({ type: "message:read", chatId: "c_1", readerId: LENA.id, messageIds: [mine.id] }));
    await waitFor(() => expect(screen.getByLabelText("Прочитано")).toBeTruthy());

    act(() => socket.receive({ type: "message:deleted", chatId: "c_1", id: live.id }));
    await waitFor(() => expect(screen.queryByText("исправлено")).toBeNull());

    // Чужой чат ленту не трогает.
    act(() => socket.receive({ type: "message:new", chatId: "c_other", message: msg("не сюда", { chatId: "c_other" }) }));
    expect(screen.queryByText("не сюда")).toBeNull();
  });

  it("подписчик канала не пишет; ограничение — с датой", async () => {
    fakeApi({ "GET /api/chats/c_1": card(chat({ type: "channel" })), [HISTORY]: page([msg("пост")]) });
    renderChat(chat({ type: "channel" }));
    await screen.findByText("пост");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByTitle("Ответить")).toBeNull();
    cleanup();

    const restricted = chat({ restrictions: { [ME.id]: "forever" } });
    fakeApi({ "GET /api/chats/c_1": card(restricted), [HISTORY]: page([]) });
    renderChat(restricted);
    expect(await screen.findByText("Вам запрещено писать в этом чате")).toBeTruthy();
    expect(await screen.findByText("Сообщений пока нет — напишите первым")).toBeTruthy();
  });
});
