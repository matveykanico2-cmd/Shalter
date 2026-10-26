import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatQueries, type ChatSummary } from "@/entities/chat";
import type { Message } from "@/entities/message";
import { sessionQueries } from "@/entities/session";

import { ws } from "@/shared/api";
import { fakeApi, fakeMedia, FakeMediaRecorder, FakeSocket, fakeSocket, FakeXhr, fakeXhr } from "@/shared/lib/test";
import { AskHost, Toaster } from "@/shared/ui";

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
    membersCount: 2,
    memberTitles: {},
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
  const router = createMemoryRouter(
    [
      { path: "/chat/:chatId", element: <ChatView /> },
      { path: "/", element: <p>Список чатов</p> },
    ],
    { initialEntries: [`/chat/${c.id}`] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
      <AskHost />
    </QueryClientProvider>
  );
  return { client, router };
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
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

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

const bubble = (id: string) => document.querySelector(`[data-message-id="${id}"]`) as HTMLElement;
const openMenu = (id: string) => fireEvent.contextMenu(bubble(id), { clientX: 10, clientY: 10 });
const menuItems = () => within(screen.getByRole("menu", { name: "Действия с сообщением" })).getAllByRole("menuitem").map((b) => b.textContent);
const typingRoutes = { "POST /api/chats/c_1/draft": { body: { ok: true } }, "POST /api/chats/c_1/typing": { body: { ok: true } } };

describe("действия с сообщением", () => {
  it("меню своего сообщения в группе; «Изменить» — правка в поле ввода, сразу в ленте", async () => {
    const mine = msg("было", { senderId: ME.id });
    let edited: Message | null = null;
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: () => page([edited ?? mine]),
      [`PATCH /api/chats/c_1/messages/${mine.id}`]: (body) => {
        edited = { ...mine, text: String(body.text), editedAt: mine.createdAt };
        return { body: { message: edited } };
      },
      ...typingRoutes,
    });
    renderChat();
    await screen.findByText("было");

    openMenu(mine.id);
    expect(menuItems()).toEqual(["Ответить", "Переслать", "Копировать текст", "Выделить текст", "Копировать ссылку", "Выбрать", "Ответить в теме", "Перевести", "Изменить", "Удалить"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Изменить" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("Изменение")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Сообщение" }) as HTMLTextAreaElement;
    expect(input.value).toBe("было");

    fireEvent.change(input, { target: { value: "стало " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("стало")).toBeTruthy();
    expect(input.value).toBe("");
    expect(screen.queryByText("Изменение")).toBeNull();
    expect(calls.find((c) => c.key.startsWith("PATCH"))?.body).toEqual({ text: "стало" });
    // Правка не трогает черновик.
    expect(calls.some((c) => c.key === "POST /api/chats/c_1/draft")).toBe(false);
  });

  it("стрелка вверх в пустом поле — правка последнего своего; Escape — отмена с возвратом набранного", async () => {
    const mine = msg("моё", { senderId: ME.id });
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([mine, msg("чужое")]), ...typingRoutes });
    renderChat();
    await screen.findByText("моё");
    const input = screen.getByRole("textbox", { name: "Сообщение" }) as HTMLTextAreaElement;

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("моё");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(screen.queryByText("Изменение")).toBeNull();
  });

  it("удаление у всех; отказ сервера возвращает сообщение и показывает причину", async () => {
    const a = msg("первое", { senderId: ME.id });
    const b = msg("второе", { senderId: ME.id });
    let status = 200;
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([a, b]),
      [`DELETE /api/chats/c_1/messages/${b.id}`]: (body) => ({ status, body: status === 200 ? { ok: true, id: b.id, forEveryone: body.forEveryone } : { error: "Нельзя" } }),
    });
    renderChat();
    await screen.findByText("второе");

    status = 403;
    openMenu(b.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Удалить" }));
    const dialog = screen.getByRole("dialog", { name: "Удалить сообщение?" });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(bubbles()).toEqual([a.id]);
    expect(await screen.findByText("Нельзя")).toBeTruthy();
    await waitFor(() => expect(bubbles()).toEqual([a.id, b.id]));
    expect(calls.find((c) => c.key.startsWith("DELETE"))?.body).toEqual({ forEveryone: true });

    status = 200;
    openMenu(b.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Удалить" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(bubbles()).toEqual([a.id]));
    expect(calls.filter((c) => c.key.startsWith("DELETE")).at(-1)?.body).toEqual({ forEveryone: false });
  });

  it("чужое сообщение: удалить можно только у себя", async () => {
    const theirs = msg("чужое");
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([theirs]) });
    renderChat();
    await screen.findByText("чужое");
    openMenu(theirs.id);
    expect(menuItems()).not.toContain("Изменить");
    fireEvent.click(screen.getByRole("menuitem", { name: "Удалить" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(within(dialog).getByText("Чужое сообщение можно убрать только из своей переписки.")).toBeTruthy();
  });

  it("двойное нажатие — реакции; своя реакция сразу в пузыре, повтор снимает", async () => {
    const theirs = msg("смешно");
    const reacted = { ...theirs, reactions: [{ emoji: "😂", userIds: [ME.id] }] };
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([theirs]),
      [`POST /api/chats/c_1/messages/${theirs.id}/react`]: () => ({ body: { message: calls.filter((c) => c.key.endsWith("/react")).length % 2 ? reacted : theirs } }),
    });
    renderChat();
    await screen.findByText("смешно");

    fireEvent.pointerUp(bubble(theirs.id), { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(bubble(theirs.id), { clientX: 6, clientY: 5 });
    const strip = screen.getByRole("group", { name: "Реакции" });
    fireEvent.click(within(strip).getByRole("button", { name: "😂" }));
    const pill = await screen.findByRole("button", { name: "😂 1" });
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    expect(calls.find((c) => c.key.endsWith("/react"))?.body).toEqual({ emoji: "😂" });

    fireEvent.click(pill);
    await waitFor(() => expect(screen.queryByRole("button", { name: "😂 1" })).toBeNull());
  });

  it("плашка реакций: Premium с замком, ▾ — все эмодзи и стикеры; кто поставил — правой кнопкой", async () => {
    const theirs = msg("ура", { reactions: [{ emoji: "🔥", userIds: [LENA.id] }] });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([theirs]),
      [`POST /api/chats/c_1/messages/${theirs.id}/react`]: (body) => ({
        body: { message: { ...theirs, reactions: [...theirs.reactions, { emoji: String(body.emoji), userIds: [ME.id] }] } },
      }),
    });
    renderChat();
    await screen.findByText("ура");
    const openBar = () => {
      fireEvent.pointerUp(bubble(theirs.id), { clientX: 5, clientY: 5 });
      fireEvent.pointerUp(bubble(theirs.id), { clientX: 6, clientY: 5 });
      return screen.getByRole("menu", { name: "Реакции" });
    };

    // Без Premium его реакции видны, но не ставятся.
    const locked = within(openBar()).getByRole("button", { name: "💎" });
    expect(locked.title).toBe("Реакция для Premium");
    fireEvent.click(locked);
    expect(await screen.findByText("Реакция для Premium")).toBeTruthy();
    expect(calls.some((c) => c.key.endsWith("/react"))).toBe(false);

    fireEvent.click(within(openBar()).getByRole("button", { name: "Все реакции" }));
    const bar = screen.getByRole("menu", { name: "Реакции" });
    expect(within(bar).getByText("Эмодзи")).toBeTruthy();
    fireEvent.click(within(bar).getByRole("button", { name: "Привет" }));
    expect(calls.find((c) => c.key.endsWith("/react"))?.body).toEqual({ emoji: "sticker:art_hello" });
    expect(await screen.findByRole("button", { name: "sticker:art_hello 1" })).toBeTruthy();

    // Кто поставил: имя и аватарка участника.
    const fire = screen.getByRole("button", { name: "🔥 1" });
    expect(within(fire).getByTitle("Лена")).toBeTruthy();
    fireEvent.contextMenu(fire, { clientX: 10, clientY: 10 });
    const who = screen.getByRole("menu", { name: "Реакции" });
    expect(within(who).getByText("🔥 — 1")).toBeTruthy();
    expect(within(who).getByText("Лена")).toBeTruthy();
  });

  it("панель эмодзи: вставка в место курсора, «Недавние» при следующем открытии", async () => {
    localStorage.removeItem("shalter.recentEmoji");
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([]), ...typingRoutes });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");
    const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" });
    fireEvent.change(input, { target: { value: "привет мир" } });
    input.setSelectionRange(6, 6);

    fireEvent.click(screen.getByTitle("Эмодзи"));
    const panel = screen.getByRole("menu", { name: "Эмодзи" });
    expect(within(panel).queryByRole("region", { name: "Недавние" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "😀" }));
    expect(input.value).toBe("привет😀 мир");
    // Панель остаётся открытой — можно добавить ещё.
    fireEvent.click(within(panel).getByRole("button", { name: "🐻" }));
    expect(input.value).toBe("привет😀🐻 мир");

    fireEvent.click(screen.getByTitle("Эмодзи"));
    expect(screen.queryByRole("menu", { name: "Эмодзи" })).toBeNull();
    fireEvent.click(screen.getByTitle("Эмодзи"));
    const recent = within(screen.getByRole("menu", { name: "Эмодзи" })).getByRole("region", { name: "Недавние" });
    expect(within(recent).getAllByRole("button").map((b) => b.textContent)).toEqual(["🐻", "😀"]);
  });

  it("закрепить в личке — плашка над лентой ведёт к сообщению; открепить крестиком", async () => {
    const dm = chat({ type: "dm", title: null, otherUser: { ...LENA, online: false } as ChatSummary["otherUser"] });
    let target = msg("важное");
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(dm),
      [HISTORY]: () => page([target]),
      [`POST /api/chats/c_1/messages/${target.id}/pin`]: (body) => {
        target = { ...target, pinned: !!body.pinned };
        return { body: { message: target } };
      },
    });
    renderChat(dm);
    await screen.findByText("важное");

    openMenu(target.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Закрепить" }));
    const jump = await screen.findByTitle("Перейти к закреплённому");
    expect(jump.textContent).toContain("важное");
    expect(calls.find((c) => c.key.endsWith("/pin"))?.body).toEqual({ pinned: true });

    fireEvent.click(screen.getByTitle("Открепить"));
    await waitFor(() => expect(screen.queryByTitle("Перейти к закреплённому")).toBeNull());
    expect(calls.filter((c) => c.key.endsWith("/pin")).at(-1)?.body).toEqual({ pinned: false });
  });

  it("переслать в выбранный чат — с подписью, откуда", async () => {
    const other = chat({ id: "c_2", title: "Работа", unreadCount: 0 });
    const source = msg("новость");
    const forwarded = msg("новость", { id: "m_fwd", chatId: "c_2", senderId: ME.id });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([source]),
      "POST /api/chats/c_2/messages": { body: { message: forwarded } },
    });
    const { client } = renderChat();
    client.setQueryData(chatQueries.list().queryKey, [chat(), other]);
    await screen.findByText("новость");

    openMenu(source.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Переслать" }));
    const dialog = screen.getByRole("dialog", { name: "Переслать сообщение" });
    expect(within(dialog).getByRole("button", { name: "Выберите чаты" })).toHaveProperty("disabled", true);
    fireEvent.click(within(dialog).getByRole("button", { name: /Работа/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Отправить (1)" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.find((c) => c.key === "POST /api/chats/c_2/messages")?.body).toMatchObject({
      text: "новость",
      forwardedFrom: { messageId: source.id, hideAuthor: false, chatId: "c_1", chatTitle: "Семья", senderId: LENA.id, senderName: "Лена" },
    });
    expect(client.getQueryData(chatQueries.list().queryKey)?.find((c) => c.id === "c_2")?.lastMessage?.id).toBe("m_fwd");
  });
});

describe("шапка чата", () => {
  it("группа: участники; «печатает» по событию сокета и гаснет", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([]) });
    renderChat();
    ws.start();
    act(() => FakeSocket.last().open());
    expect(await screen.findByText("2 участника")).toBeTruthy();

    act(() => FakeSocket.last().receive({ type: "typing:update", chatId: "c_1", userId: LENA.id, action: "typing" }));
    expect(screen.getByText("Лена печатает…")).toBeTruthy();
    act(() => vi.advanceTimersByTime(4100));
    expect(screen.queryByText("Лена печатает…")).toBeNull();
  });

  it("личка: «в сети» по событию присутствия", async () => {
    const dm = chat({ type: "dm", title: null, otherUser: { ...LENA, online: false } as ChatSummary["otherUser"] });
    fakeApi({ "GET /api/chats/c_1": card(dm), [HISTORY]: page([]) });
    renderChat(dm);
    ws.start();
    act(() => FakeSocket.last().open());
    expect(await screen.findByText("был(а) недавно")).toBeTruthy();
    act(() => FakeSocket.last().receive({ type: "presence:update", userId: LENA.id, online: true }));
    expect(await screen.findByText("в сети")).toBeTruthy();
  });
});

describe("вложения", () => {
  it("фото открывается в просмотре с автором и подписью; стрелки листают, Escape закрывает", async () => {
    const first = msg("закат", { attachments: [{ kind: "image", url: "/uploads/a_0000000000000001.jpg", width: 800, height: 600 }] });
    const second = msg("", { senderId: ME.id, attachments: [{ kind: "image", url: "/uploads/b_0000000000000002.jpg" }] });
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([first, second]) });
    renderChat();
    await screen.findByText("закат");
    fireEvent.click(within(bubble(first.id)).getByRole("button", { name: "Фото" }));
    const viewer = await screen.findByRole("dialog", { name: "Просмотр медиа" });
    expect(within(viewer).getByText("Лена")).toBeTruthy();
    expect(within(viewer).getByText(/1 из 2/)).toBeTruthy();
    expect(within(viewer).getByText("закат")).toBeTruthy();
    expect(within(viewer).getByTitle("Скачать")).toBeTruthy();

    // Клавиши слушает эффект — он подключается чуть позже, чем окно появилось в DOM.
    // Лишние нажатия на последнем фото ничего не делают.
    await waitFor(() => {
      fireEvent.keyDown(document, { key: "ArrowRight" });
      expect(within(viewer).getByText(/2 из 2/)).toBeTruthy();
    });
    expect(within(viewer).getByText("Вы")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    // Фото без подписи — время поверх картинки, отдельной строки текста нет.
    expect(within(bubble(second.id)).queryByText("закат")).toBeNull();
  });

  it("два фото — один альбом; файл и голосовое; в защищённой личке скачать нельзя", async () => {
    const dm = chat({ type: "dm", title: null, protectedBy: [LENA.id], otherUser: { ...LENA, online: false } as ChatSummary["otherUser"] });
    const album = msg("", { attachments: [{ kind: "image", url: "/uploads/a" }, { kind: "video", url: "/uploads/v", durationSec: 65 }] });
    const file = msg("", { attachments: [{ kind: "file", url: "/uploads/f", name: "Отчёт.pdf", size: 1.5 * 1024 * 1024 }] });
    const voice = msg("", { attachments: [{ kind: "voice", url: "/uploads/voice", durationSec: 7, waveform: [1, 31, 15], transcript: "привет" }] });
    fakeApi({ "GET /api/chats/c_1": card(dm), [HISTORY]: page([album, file, voice]) });
    renderChat(dm);
    await screen.findByText("Отчёт.pdf");

    expect(within(bubble(album.id)).getByRole("button", { name: "Фото" })).toBeTruthy();
    expect(within(bubble(album.id)).getByRole("button", { name: "Видео" })).toBeTruthy();
    expect(within(bubble(album.id)).getByText("1:05")).toBeTruthy();
    expect(within(bubble(file.id)).getByText("1,5 МБ")).toBeTruthy();
    expect(bubble(file.id).querySelector("a[download]")).toBeNull();

    expect(within(bubble(voice.id)).getByRole("button", { name: "Слушать" })).toBeTruthy();
    expect(within(bubble(voice.id)).getByText("0:07")).toBeTruthy();
    fireEvent.click(within(bubble(voice.id)).getByTitle("Расшифровка"));
    expect(within(bubble(voice.id)).getByText("привет")).toBeTruthy();

    fireEvent.click(within(bubble(album.id)).getByRole("button", { name: "Видео" }));
    const viewer = await screen.findByRole("dialog", { name: "Просмотр медиа" });
    expect(within(viewer).queryByTitle("Скачать")).toBeNull();
  });
});

describe("отправка файлов", () => {
  const png = (name: string) => new File(["x"], name, { type: "image/png" });
  const pick = (testId: string, files: File[]) => fireEvent.change(screen.getByTestId(testId), { target: { files } });

  it("фото: окно отправки, загрузка, сообщение с подписью из поля и спойлером", async () => {
    fakeXhr();
    const sent = msg("море", { senderId: ME.id, attachments: [{ kind: "image", url: "/uploads/a" }, { kind: "image", url: "/uploads/b" }] });
    const { calls } = fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([]), "POST /api/chats/c_1/messages": { body: { message: sent } }, ...typingRoutes });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");
    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), { target: { value: "море" } });

    pick("attach-media", [png("1.png"), png("2.png")]);
    const dialog = screen.getByRole("dialog", { name: "Отправить 2 фото" });
    fireEvent.click(within(dialog).getByTitle("Ещё"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Скрыть под спойлер" }));
    expect(within(dialog).getByText("🫥 Фото и видео будут размыты — откроются по нажатию")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Отправить" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await waitFor(() => expect(FakeXhr.requests).toHaveLength(2));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(FakeXhr.requests.map((x) => x.params.kind)).toEqual(["image", "image"]);
    act(() => FakeXhr.requests[0]!.respond(200, { url: "/uploads/a", name: "1.png" }));
    act(() => FakeXhr.requests[1]!.respond(200, { url: "/uploads/b", name: "2.png" }));

    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/chats/c_1/messages")).toBe(true));
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({
      text: "море",
      attachments: [
        { kind: "image", url: "/uploads/a", spoiler: true },
        { kind: "image", url: "/uploads/b", spoiler: true },
      ],
    });
    expect((screen.getByRole("textbox", { name: "Сообщение" }) as HTMLTextAreaElement).value).toBe("");
    // У собеседника — «отправляет фото», потом отбой.
    expect(calls.filter((c) => c.key === "POST /api/chats/c_1/typing").map((c) => (c.body as { action: string }).action)).toEqual(
      expect.arrayContaining(["upload_photo", "cancel"])
    );
    await waitFor(() => expect(bubbles()).toEqual([sent.id]));
  });

  it("без сжатия — файлом; отменённое не отправляется; ошибка загрузки — над полем", async () => {
    fakeXhr();
    const { calls } = fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([]), ...typingRoutes });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");

    pick("attach-media", [png("1.png"), png("2.png")]);
    fireEvent.click(within(screen.getByRole("dialog")).getByTitle("Ещё"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Отправить без сжатия" }));
    expect(screen.getByRole("dialog", { name: "Отправить 2 файла" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(FakeXhr.requests).toHaveLength(2));
    expect(FakeXhr.requests.map((x) => x.params.kind)).toEqual(["file", "file"]);

    fireEvent.click(screen.getAllByTitle("Отменить")[0]!);
    act(() => FakeXhr.requests[1]!.respond(413, {}));
    expect(await screen.findByText("Файл слишком большой для сервера")).toBeTruthy();
    expect(calls.some((c) => c.key === "POST /api/chats/c_1/messages")).toBe(false);
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});

describe("опросы, чек-листы, кубики, платные посты", () => {
  const poll = (patch: Record<string, unknown> = {}) => ({ kind: "poll", meta: { options: ["Пицца", "Суши"], voterIds: [[LENA.id], []], votes: [1, 0], correctIndex: null, multiple: false, closed: false, ...patch } });

  it("голос сразу с процентами; ответ сервера поверх; «Отменить голос»", async () => {
    let onServer = msg("Что на ужин?", { attachments: [poll()] });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: () => page([onServer]),
      [`POST /api/chats/c_1/messages/${onServer.id}/vote`]: (body) => {
        onServer = { ...onServer, attachments: [poll({ voterIds: [[LENA.id], [ME.id]], votes: [1, 1] })] };
        return { body: { message: onServer, optionIndex: body.optionIndex } };
      },
      [`DELETE /api/chats/c_1/messages/${onServer.id}/vote`]: () => {
        onServer = { ...onServer, attachments: [poll()] };
        return { body: { message: onServer } };
      },
    });
    renderChat();
    // Вопрос — заголовок опроса, отдельной строкой текста не дублируется.
    expect(await screen.findAllByText("Что на ужин?")).toHaveLength(1);
    expect(screen.getByText("1 проголосовал")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Суши/ }));
    expect(await screen.findAllByText("50%")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Суши/ }).getAttribute("aria-pressed")).toBe("true");
    expect(calls.find((c) => c.key.endsWith("/vote"))?.body).toEqual({ optionIndex: 1 });
    await waitFor(() => expect(screen.getByText("2 проголосовали")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Отменить голос" }));
    await waitFor(() => expect(screen.queryByText("50%")).toBeNull());
    expect(calls.some((c) => c.key.startsWith("DELETE") && c.key.endsWith("/vote"))).toBe(true);
  });

  it("свой опрос можно остановить после подтверждения", async () => {
    const mine = msg("Когда встречаемся?", { senderId: ME.id, attachments: [poll()] });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([mine]),
      [`POST /api/chats/c_1/messages/${mine.id}/poll/close`]: { body: { message: { ...mine, attachments: [poll({ closed: true })] } } },
    });
    renderChat();
    fireEvent.click(await screen.findByRole("button", { name: "Остановить" }));
    const confirm = await screen.findByRole("dialog", { name: /Остановить опрос/ });
    fireEvent.click(within(confirm).getByRole("button", { name: "Остановить" }));
    expect(await screen.findByText("Опрос завершён")).toBeTruthy();
    expect(calls.some((c) => c.key.endsWith("/poll/close"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Остановить" })).toBeNull();
  });

  it("чек-лист: отметка сразу, кто отметил — имя", async () => {
    const list = msg("Покупки", {
      attachments: [{ kind: "checklist", meta: { items: [{ id: 1, text: "Хлеб", doneBy: LENA.id }, { id: 2, text: "Молоко" }], othersCanMark: true } }],
    });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([list]),
      [`POST /api/chats/c_1/messages/${list.id}/checklist`]: {
        body: { message: { ...list, attachments: [{ kind: "checklist", meta: { items: [{ id: 1, text: "Хлеб", doneBy: LENA.id }, { id: 2, text: "Молоко", doneBy: ME.id }], othersCanMark: true } }] } },
      },
    });
    renderChat();
    expect(await screen.findByText("Выполнено 1 из 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Молоко/ }));
    expect(await screen.findByText("Выполнено 2 из 2")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /Молоко/ })).getByText("вы")).toBeTruthy();
    expect(calls.find((c) => c.key.endsWith("/checklist"))?.body).toEqual({ itemId: 2 });
  });

  it("кубик со значением — результат; платный пост открывается за звёзды", async () => {
    const dice = msg("", { createdAt: "2026-10-01T10:00:00.000Z", attachments: [{ kind: "dice", meta: { emoji: "🎯", value: 6 } }] });
    const paid = msg("", { paidStars: 25, attachments: [{ kind: "paid", meta: { stars: 25, photos: 1 } }] });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([dice, paid]),
      [`GET /api/chats/c_1/messages/${paid.id}/paid`]: { status: 402, body: { error: "Пост платный", stars: 25 } },
      [`POST /api/chats/c_1/messages/${paid.id}/unlock`]: { body: { attachments: [{ kind: "image", url: "/uploads/secret" }], balance: 75 } },
    });
    renderChat();
    expect(await screen.findByText("В яблочко!")).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "⭐ Открыть за 25 звёзд" }));
    const confirm = await screen.findByRole("dialog", { name: /Открыть 1 фото за 25/ });
    fireEvent.click(within(confirm).getByRole("button", { name: "Открыть за 25 ⭐" }));
    expect(await screen.findByText("Пост открыт")).toBeTruthy();
    await waitFor(() => expect(within(bubble(paid.id)).getByRole("button", { name: "Фото" })).toBeTruthy());
    expect(calls.some((c) => c.key.endsWith("/unlock"))).toBe(true);
  });

  it("опрос и кубик из скрепки уходят своими сообщениями", async () => {
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([]),
      "POST /api/chats/c_1/messages": (body) => ({ body: { message: msg(String(body.text), { senderId: ME.id, attachments: body.attachments as unknown[] }) } }),
      ...typingRoutes,
    });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");

    fireEvent.click(screen.getByTitle("Прикрепить"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Опрос" }));
    const dialog = screen.getByRole("dialog", { name: "Новый опрос" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Введите вопрос");
    fireEvent.change(within(dialog).getByLabelText("Вопрос"), { target: { value: "Куда?" } });
    fireEvent.change(within(dialog).getByLabelText("Вариант 1"), { target: { value: "Море" } });
    fireEvent.change(within(dialog).getByLabelText("Вариант 2"), { target: { value: "Горы" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Викторина" }));
    fireEvent.click(within(dialog).getAllByTitle("Правильный ответ")[1]!);
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    await waitFor(() => expect(calls.filter((c) => c.key === "POST /api/chats/c_1/messages")).toHaveLength(1));
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({
      text: "Куда?",
      attachments: [{ kind: "poll", meta: { options: ["Море", "Горы"], correctIndex: 1, multiple: false } }],
    });

    fireEvent.click(screen.getByTitle("Прикрепить"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Кубик и игры" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Боулинг/ }));
    await waitFor(() => expect(calls.filter((c) => c.key === "POST /api/chats/c_1/messages")).toHaveLength(2));
    expect(calls.filter((c) => c.key === "POST /api/chats/c_1/messages")[1]?.body).toMatchObject({ text: "", attachments: [{ kind: "dice", meta: { emoji: "🎳" } }] });
  });
});

describe("запись голосовых", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("пустое поле — кнопки записи; нажатие — запись без рук, «Отправить» — загрузка и голосовое", async () => {
    fakeXhr();
    const { track } = fakeMedia();
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([]),
      "POST /api/chats/c_1/messages": (body) => ({ body: { message: msg("", { senderId: ME.id, attachments: body.attachments as unknown[] }) } }),
      ...typingRoutes,
    });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");
    expect(screen.queryByRole("button", { name: "Отправить" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Голосовое сообщение" }));
    const bar = await screen.findByRole("group", { name: "Запись голосового" });
    await waitFor(() => expect(within(bar).getByRole("button", { name: "Отправить" })).toHaveProperty("disabled", false));
    expect(calls.some((c) => c.key === "POST /api/chats/c_1/typing" && (c.body as { action: string }).action === "record_voice")).toBe(true);

    fireEvent.click(within(bar).getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(FakeXhr.requests).toHaveLength(1));
    expect(FakeXhr.requests[0]!.params).toMatchObject({ kind: "voice", mimeType: "audio/webm" });
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Запись голосового" })).toBeNull();
    act(() => FakeXhr.requests[0]!.respond(200, { url: "/uploads/v.webm", name: "voice.webm", mimeType: "audio/webm" }));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/chats/c_1/messages")).toBe(true));
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({ text: "", attachments: [{ kind: "voice", url: "/uploads/v.webm", durationSec: 0 }] });
  });

  it("удержание: потянуть влево — отмена, ничего не уходит; набран текст — вместо записи «Отправить»", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fakeXhr();
    fakeMedia();
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([]), ...typingRoutes });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");

    const mic = screen.getByRole("button", { name: "Голосовое сообщение" });
    fireEvent.pointerDown(mic, { pointerId: 1, clientX: 300, clientY: 500, button: 0 });
    act(() => vi.advanceTimersByTime(500));
    await screen.findByRole("group", { name: "Запись голосового" });
    expect(screen.getByText("← Отмена")).toBeTruthy();
    await waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(1));
    fireEvent.pointerMove(mic, { pointerId: 1, clientX: 150, clientY: 500 });
    await waitFor(() => expect(screen.queryByRole("group", { name: "Запись голосового" })).toBeNull());
    fireEvent.pointerUp(mic, { pointerId: 1, clientX: 150, clientY: 500 });
    expect(FakeXhr.requests).toHaveLength(0);

    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), { target: { value: "текст" } });
    expect(screen.queryByRole("button", { name: "Голосовое сообщение" })).toBeNull();
    expect(screen.getByRole("button", { name: "Отправить" })).toBeTruthy();
  });
});

describe("стикеры и эмодзи", () => {
  it("стикер — сценой, 1–3 эмодзи — крупно, свои эмодзи — сценой в тексте", async () => {
    const sticker = msg("", { type: "sticker", sticker: { emoji: "👋", name: "Привет", scene: "hello" } });
    const jumbo = msg("😐😐");
    const plainJumbo = msg("🧭");
    const custom = msg("смотри [ce:0]", { customEmoji: [{ v: 1, loop: 3, bg: null, layers: [{ type: "emoji", emoji: "🐱", x: 50, y: 50, size: 40 }] }] });
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([sticker, jumbo, plainJumbo, custom]) });
    renderChat();
    await screen.findByText(/смотри/);
    await waitFor(() => expect(bubble(sticker.id).querySelector(".sticker-message .char-scene, .sticker-message .anim-scene")).toBeTruthy());
    // Анимированные Noto — анимацией с подписью, остальные — просто крупно.
    expect(within(bubble(jumbo.id)).getByLabelText("😐😐")).toBeTruthy();
    expect(within(bubble(plainJumbo.id)).getByText("🧭")).toBeTruthy();
    await waitFor(() => expect(bubble(custom.id).querySelector(".inline-custom-emoji .ce-scene text")?.textContent).toBe("🐱"));
  });

  it("выбор стикера: разделы, отправка стикера, «выбирает стикер» у собеседника", async () => {
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([]),
      "GET /api/stickers/packs": { body: { packs: [{ id: "sp_1", name: "Котики", stickers: [{ kind: "image", url: "/uploads/cat", emoji: "🐱", name: "Кот" }] }], maxStickers: 60 } },
      "POST /api/chats/c_1/messages": (body) => ({ body: { message: msg("", { senderId: ME.id, type: "sticker", sticker: body.sticker }) } }),
      ...typingRoutes,
    });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");
    fireEvent.click(screen.getByTitle("Стикеры"));
    const panel = screen.getByRole("menu", { name: "Стикеры" });
    expect(within(panel).getByRole("region", { name: "Shalter" })).toBeTruthy();
    expect(await within(panel).findByRole("region", { name: "Котики" })).toBeTruthy();
    expect(calls.some((c) => c.key === "POST /api/chats/c_1/typing" && (c.body as { action: string }).action === "choose_sticker")).toBe(true);

    fireEvent.click(within(panel).getAllByRole("button", { name: "Привет" })[0]!);
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/chats/c_1/messages")).toBe(true));
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({ text: "", sticker: { emoji: "👋", name: "Привет", scene: "hello" } });
  });

  it("в канале кнопки стикеров нет", async () => {
    const channel = chat({ type: "channel", ownerIds: [ME.id], adminIds: [ME.id] });
    fakeApi({ "GET /api/chats/c_1": card(channel), [HISTORY]: page([]) });
    renderChat(channel);
    await screen.findByText("Сообщений пока нет — напишите первым");
    expect(screen.queryByTitle("Стикеры")).toBeNull();
  });
});

describe("ещё в меню сообщения", () => {
  it("«Выбрать»: отметка нажатием, удаление выбранных у себя; Esc снимает выбор", async () => {
    const a = msg("первое");
    const b = msg("второе");
    const c = msg("третье");
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: () => page([a, b, c].filter((m) => !calls.some((x) => x.key === `DELETE /api/chats/c_1/messages/${m.id}`))),
      [`DELETE /api/chats/c_1/messages/${a.id}`]: { body: { ok: true, id: a.id, forEveryone: false } },
      [`DELETE /api/chats/c_1/messages/${c.id}`]: { body: { ok: true, id: c.id, forEveryone: false } },
    });
    renderChat();
    await screen.findByText("первое");

    openMenu(a.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Выбрать" }));
    expect(screen.getByText("Выбрано: 1")).toBeTruthy();
    // В режиме выбора нажатие отмечает, а правая кнопка не открывает меню.
    fireEvent.click(screen.getByText("третье"));
    expect(screen.getByText("Выбрано: 2")).toBeTruthy();
    fireEvent.contextMenu(bubble(b.id));
    expect(screen.getByText("Выбрано: 3")).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByText("второе"));

    fireEvent.click(screen.getByTitle("Удалить"));
    const dialog = screen.getByRole("dialog", { name: "Удалить сообщений: 2" });
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(bubbles()).toEqual([b.id]));
    expect(calls.filter((x) => x.key.startsWith("DELETE")).map((x) => x.body)).toEqual([{ forEveryone: false }, { forEveryone: false }]);
    expect(screen.queryByText(/Выбрано/)).toBeNull();

    openMenu(b.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Выбрать" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(/Выбрано/)).toBeNull();
  });

  it("«Прочитали: N» у своего в группе — кто и во сколько", async () => {
    const mine = msg("моё", { senderId: ME.id, readByIds: [ME.id, LENA.id] });
    fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([mine]),
      [`GET /api/chats/c_1/messages/${mine.id}/readers`]: { body: { readers: [{ user: LENA, readAt: new Date().toISOString() }] } },
    });
    renderChat();
    await screen.findByText("моё");
    openMenu(mine.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Прочитали: 1" }));
    const readers = screen.getByRole("menu", { name: "Прочитали" });
    expect(await within(readers).findByText(/^Лена · сегодня в \d\d:\d\d$/)).toBeTruthy();
  });

  it("ответ с выделенной частью — цитатой в поле; свайп влево пальцем — ответ", async () => {
    const theirs = msg("первая строка и вторая");
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([theirs]), ...typingRoutes });
    renderChat();
    const text = await screen.findByText("первая строка и вторая");
    const input = screen.getByRole("textbox", { name: "Сообщение" }) as HTMLTextAreaElement;

    const range = document.createRange();
    range.setStart(text.firstChild!, 0);
    range.setEnd(text.firstChild!, 13);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    openMenu(theirs.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Ответить" }));
    expect(screen.getByText("Ответ Лена")).toBeTruthy();
    expect(input.value).toBe("> первая строка\n");
    window.getSelection()!.removeAllRanges();

    fireEvent.click(screen.getByTitle("Отменить ответ"));
    expect(screen.queryByText("Ответ Лена")).toBeNull();
    const row = bubble(theirs.id);
    fireEvent.pointerDown(row, { pointerType: "touch", clientX: 300, clientY: 100 });
    fireEvent.pointerMove(row, { pointerType: "touch", clientX: 280, clientY: 101 });
    fireEvent.pointerMove(row, { pointerType: "touch", clientX: 240, clientY: 102 });
    fireEvent.pointerUp(row, { pointerType: "touch", clientX: 240, clientY: 102 });
    expect(screen.getByText("Ответ Лена")).toBeTruthy();
  });

  it("«Ответить лично» — личка с автором и цитатой в черновике", async () => {
    const theirs = msg("встречаемся в 7");
    const dm = chat({ id: "c_dm", type: "dm", title: null, memberIds: [ME.id, LENA.id], otherUser: LENA as never, unreadCount: 0 });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([theirs]),
      "POST /api/chats": { body: { chat: dm } },
      "POST /api/chats/c_dm/draft": { body: { ok: true } },
      "GET /api/chats": () => ({ body: { chats: calls.some((x) => x.key === "POST /api/chats") ? [chat(), { ...dm, draft: "> встречаемся в 7\n" }] : [chat()] } }),
      "GET /api/chats/c_dm": card({ ...dm, draft: "> встречаемся в 7\n" }),
      "GET /api/chats/c_dm/messages?limit=60": page([]),
    });
    renderChat();
    await screen.findByText("встречаемся в 7");
    openMenu(theirs.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Ответить лично" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Лена" })).toBeTruthy());
    expect(calls.find((x) => x.key === "POST /api/chats")?.body).toMatchObject({ userId: LENA.id, title: "Лена" });
    expect(calls.find((x) => x.key === "POST /api/chats/c_dm/draft")?.body).toEqual({ text: "> встречаемся в 7\n" });
    expect((screen.getByRole("textbox", { name: "Сообщение" }) as HTMLTextAreaElement).value).toBe("> встречаемся в 7\n");
  });

  it("«Перевести» — окно с переводом; язык запоминается в настройках", async () => {
    const theirs = msg("Hello there");
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([theirs]),
      "POST /api/translate": (body) => ({ body: { translated: body.target === "de" ? "Hallo" : "Привет", detectedLang: "en" } }),
      "PATCH /api/settings": { body: { settings: {} } },
    });
    renderChat();
    await screen.findByText("Hello there");
    openMenu(theirs.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Перевести" }));

    const dialog = screen.getByRole("dialog", { name: "Перевод" });
    expect(await within(dialog).findByText("Привет")).toBeTruthy();
    expect(within(dialog).getByText("Перевод с английского")).toBeTruthy();
    expect(calls.find((x) => x.key === "POST /api/translate")?.body).toEqual({ text: "Hello there", target: "ru" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Язык перевода" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Deutsch" }));
    expect(await within(dialog).findByText("Hallo")).toBeTruthy();
    expect(calls.find((x) => x.key === "PATCH /api/settings")?.body).toEqual({ translateLanguage: "de" });
  });

  it("«Кратко» — сводка под длинным сообщением, повтор прячет", async () => {
    const long = msg("Очень длинный текст. ".repeat(25));
    fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([long]),
      [`GET /api/chats/c_1/messages/${long.id}/summary`]: { body: { summary: "Коротко о главном" } },
    });
    renderChat();
    await screen.findByText(/Очень длинный текст/);
    openMenu(long.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Кратко" }));
    expect(await screen.findByText("Коротко о главном")).toBeTruthy();

    openMenu(long.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Скрыть сводку" }));
    expect(screen.queryByText("Коротко о главном")).toBeNull();
  });

  it("«Пожаловаться» — причина и подробности уходят жалобой", async () => {
    const theirs = msg("купи крипту");
    const { calls } = fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([theirs]), "POST /api/reports": { body: { report: {} } } });
    renderChat();
    await screen.findByText("купи крипту");
    openMenu(theirs.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Пожаловаться" }));
    const dialog = screen.getByRole("dialog", { name: "Пожаловаться на сообщение от Лена" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Мошенничество" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Подробности" }), { target: { value: "развод" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Отправить жалобу" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.find((x) => x.key === "POST /api/reports")?.body).toEqual({ targetType: "message", targetId: theirs.id, reason: "scam", details: "развод" });
  });

  it("личка: чужое — «Удалить за звёзды» после подтверждения с ценой", async () => {
    const dm = chat({ type: "dm", title: null, otherUser: LENA as never });
    const theirs = msg("лишнее");
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(dm),
      [HISTORY]: () => page(calls.some((x) => x.key.startsWith("POST /api/stars/delete")) ? [] : [theirs]),
      "GET /api/stars": { body: { balance: 50, userId: ME.id, messagePriceStars: 0, packs: [], costs: { boost: 10, boostMinutes: 60, delete: 5, maxMessagePrice: 100 } } },
      [`POST /api/stars/delete/${theirs.id}`]: { body: { ok: true, balance: 45 } },
    });
    renderChat(dm);
    await screen.findByText("лишнее");
    openMenu(theirs.id);
    expect(menuItems()).not.toContain("Ответить лично");
    fireEvent.click(screen.getByRole("menuitem", { name: "Удалить за звёзды" }));
    const ask = await screen.findByRole("dialog", { name: "Удалить сообщение у обоих за 5 ⭐?" });
    fireEvent.click(within(ask).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(bubbles()).toEqual([]));
    expect(calls.some((x) => x.key === `POST /api/stars/delete/${theirs.id}`)).toBe(true);
  });
});

describe("темы и ветки", () => {
  const TOPIC = { id: "topic_a", chatId: "c_1", title: "Поездка", icon: "🎉", color: "#f80", closed: false, createdBy: LENA.id, createdAt: "2026-10-20T10:00:00.000Z", messageCount: 1, lastMessageAt: "2026-10-22T10:00:00.000Z" };
  const topicsOn = () => chat({ topicsEnabled: true });

  it("вкладки тем: лента темы, отправка в тему, закрытая тема — без поля ввода", async () => {
    const all = msg("в общем чате");
    const inTopic = msg("про поездку", { topicId: TOPIC.id });
    const sent = msg("едем!", { senderId: ME.id, topicId: TOPIC.id });
    let topics = [TOPIC];
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(topicsOn()),
      [HISTORY]: () => page(calls.some((c) => c.key === "POST /api/chats/c_1/messages") ? [all, inTopic, sent] : [all, inTopic]),
      [`${HISTORY}&topic=${TOPIC.id}`]: () => page(calls.some((c) => c.key === "POST /api/chats/c_1/messages") ? [inTopic, sent] : [inTopic]),
      "GET /api/chats/c_1/topics": () => ({ body: { enabled: true, topics } }),
      "POST /api/chats/c_1/messages": { body: { message: sent } },
      ...typingRoutes,
    });
    renderChat(topicsOn());
    await screen.findByText("в общем чате");

    const tabs = await screen.findByRole("tablist", { name: "Темы" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Все", "#Общее", "🎉Поездка"]);
    fireEvent.click(within(tabs).getByRole("tab", { name: /Поездка/ }));
    await waitFor(() => expect(bubbles()).toEqual([inTopic.id]));

    const input = screen.getByRole("textbox", { name: "Сообщение" });
    fireEvent.change(input, { target: { value: "едем!" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(bubbles()).toEqual([inTopic.id, sent.id]));
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({ text: "едем!", topicId: TOPIC.id });

    // Тему закрыли — писать в неё может только админ.
    topics = [{ ...TOPIC, closed: true }];
    ws.start();
    act(() => FakeSocket.last().open());
    act(() => FakeSocket.last().receive({ type: "topics:updated", chatId: "c_1" }));
    expect(await screen.findByText("Тема закрыта — писать в неё могут только администраторы")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Сообщение" })).toBeNull();

    // Во «Всех» — и то, что отправили в тему.
    fireEvent.click(within(tabs).getByRole("tab", { name: "Все" }));
    await waitFor(() => expect(bubbles()).toEqual([all.id, inTopic.id, sent.id]));
  });

  it("новая тема: окно, создание и переход в неё", async () => {
    const created = { ...TOPIC, id: "topic_b", title: "Подарки", icon: "", messageCount: 0 };
    let topics = [TOPIC];
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(topicsOn()),
      [HISTORY]: page([msg("привет")]),
      [`${HISTORY}&topic=topic_b`]: page([]),
      "GET /api/chats/c_1/topics": () => ({ body: { enabled: true, topics } }),
      "POST /api/chats/c_1/topics": () => {
        topics = [...topics, created];
        return { body: { topic: created } };
      },
    });
    renderChat(topicsOn());
    fireEvent.click(await screen.findByTitle("Новая тема"));
    const dialog = screen.getByRole("dialog", { name: "Новая тема" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
    expect(within(dialog).getByText("Введите название")).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Название темы" }), { target: { value: "Подарки" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));

    expect(await screen.findByRole("tab", { name: "Подарки", selected: true })).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/topics")?.body).toEqual({ title: "Подарки", icon: "" });
    expect(await screen.findByText("Сообщений пока нет — напишите первым")).toBeTruthy();
  });

  it("ветка: «N ответов» под сообщением, ответ уходит в ветку, чужой приходит событием", async () => {
    const root = msg("куда едем?", { commentCount: 1 });
    const first = msg("на море", { threadRootId: root.id });
    const mine = msg("в горы", { senderId: ME.id, threadRootId: root.id });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([root]),
      [`GET /api/chats/c_1/messages/${root.id}/thread`]: { body: { root, replies: [first] } },
      "POST /api/chats/c_1/messages": { body: { message: mine } },
    });
    renderChat();
    fireEvent.click(await screen.findByRole("button", { name: "💬 1 ответ" }));

    const panel = screen.getByRole("dialog", { name: "Тема" });
    expect(await within(panel).findByText("на море")).toBeTruthy();
    expect(within(panel).getByText("Ответы (1)")).toBeTruthy();
    const input = within(panel).getByRole("textbox", { name: "Ответ в теме" });
    fireEvent.change(input, { target: { value: "в горы" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await within(panel).findByText("в горы")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toEqual({ text: "в горы", threadRootId: root.id });
    expect((input as HTMLTextAreaElement).value).toBe("");

    ws.start();
    act(() => FakeSocket.last().open());
    act(() => FakeSocket.last().receive({ type: "thread:message", chatId: "c_1", rootId: root.id, message: msg("а я дома", { threadRootId: root.id }) }));
    expect(await within(panel).findByText("а я дома")).toBeTruthy();
    expect(within(panel).getByText("Ответы (3)")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Тема" })).toBeNull();
  });

  it("«Ответить в теме» из меню открывает ветку", async () => {
    const root = msg("вопрос");
    fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([root]),
      [`GET /api/chats/c_1/messages/${root.id}/thread`]: { body: { root, replies: [] } },
    });
    renderChat();
    await screen.findByText("вопрос");
    openMenu(root.id);
    fireEvent.click(screen.getByRole("menuitem", { name: "Ответить в теме" }));
    expect(await screen.findByText("Пока нет ответов — начните тему первым")).toBeTruthy();
  });
});

describe("геолокация и контакт из скрепки", () => {
  const sentRoute = { "POST /api/chats/c_1/messages": (body: Record<string, unknown>) => ({ body: { message: msg("", { senderId: ME.id, attachments: body.attachments as never }) } }) };
  const stubGeo = (getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => void) => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
  };
  const attach = (name: string) => {
    fireEvent.click(screen.getByTitle("Прикрепить"));
    fireEvent.click(screen.getByRole("menuitem", { name }));
  };

  it("GPS отдал координаты — геолокация уходит сразу", async () => {
    stubGeo((ok) => ok({ coords: { latitude: 55.75, longitude: 37.62 } } as GeolocationPosition));
    const { calls } = fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([msg("привет")]), ...sentRoute });
    renderChat();
    await screen.findByText("привет");
    attach("Геолокация");
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({ attachments: [{ kind: "location", meta: { lat: 55.75, lng: 37.62 } }] }));
  });

  it("GPS запрещён — окно: примерное место по IP", async () => {
    stubGeo((_ok, fail) => fail({ code: 1 } as GeolocationPositionError));
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([msg("привет")]),
      "GET /api/geo/ip": { body: { lat: 59.9, lng: 30.3, city: "Санкт-Петербург" } },
      ...sentRoute,
    });
    renderChat();
    await screen.findByText("привет");
    attach("Геолокация");
    const dialog = await screen.findByRole("dialog", { name: "Геолокация" });
    expect(within(dialog).getByText(/Нет доступа к геолокации/)).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole("button", { name: "📍 Отправить примерное — Санкт-Петербург" }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({ attachments: [{ kind: "location", meta: { lat: 59.9, lng: 30.3 } }] }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("контакт: свои контакты и участники чата", async () => {
    const OLEG = { id: "u_oleg00000", name: "Олег", phone: "+79990000003" };
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([msg("привет")]),
      "GET /api/contacts": { body: { contacts: [{ id: "ct_1_a", ownerId: ME.id, userId: OLEG.id, addedAt: "2026-10-01T10:00:00.000Z", localName: null, note: null, user: OLEG }] } },
      ...sentRoute,
    });
    renderChat();
    await screen.findByText("привет");
    attach("Контакт");
    const dialog = await screen.findByRole("dialog", { name: "Отправить контакт" });
    expect((await within(dialog).findAllByRole("button")).map((b) => b.textContent)).toEqual(["ООлег", "ЛЛена", "Отмена"]);
    fireEvent.click(within(dialog).getByRole("button", { name: /Олег/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({ attachments: [{ kind: "contact", meta: { userId: OLEG.id, name: "Олег", phone: OLEG.phone } }] })
    );
  });
});

describe("варианты отправки", () => {
  const sendRoute = {
    "POST /api/chats/c_1/messages": (body: Record<string, unknown>) => ({
      body: { message: msg(String(body.text), { senderId: ME.id, ...(body.effect ? { effect: String(body.effect) } : {}) }) },
    }),
  };
  const type = (value: string) => fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), { target: { value } });
  const sendMenu = () => fireEvent.contextMenu(screen.getByRole("button", { name: "Отправить" }));

  it("длинный текст — несколькими сообщениями", async () => {
    const { calls } = fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([msg("привет")]), ...sendRoute, ...typingRoutes });
    renderChat();
    await screen.findByText("привет");
    type(`${"а".repeat(3000)}\n${"б".repeat(3000)}`);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Сообщение" }), { key: "Enter" });
    await waitFor(() => expect(calls.filter((c) => c.key === "POST /api/chats/c_1/messages")).toHaveLength(2));
    expect(calls.filter((c) => c.key === "POST /api/chats/c_1/messages").map((c) => String((c.body as { text: string }).text).length)).toEqual([3000, 3000]);
  });

  it("правой кнопкой: без звука; в личке — с эффектом", async () => {
    const dm = chat({ type: "dm", title: null, otherUser: LENA as never });
    const { calls } = fakeApi({ "GET /api/chats/c_1": card(dm), [HISTORY]: page([msg("привет")]), ...sendRoute, ...typingRoutes });
    renderChat(dm);
    await screen.findByText("привет");
    type("тихо");
    sendMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Отправить без звука" }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages")?.body).toMatchObject({ text: "тихо", silent: true }));

    type("ура");
    sendMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Отправить с эффектом" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Праздник/ }));
    await waitFor(() => expect(calls.filter((c) => c.key === "POST /api/chats/c_1/messages")[1]?.body).toMatchObject({ text: "ура", effect: "🎉" }));
    expect(await screen.findByTitle("Повторить эффект")).toBeTruthy();
  });

  it("отправить позже: время и повтор, поле очищается, затем список запланированных", async () => {
    const at = new Date(Date.now() + 3 * 3600_000);
    const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    const item = { id: "sch_1", chatId: "c_1", senderId: ME.id, text: "напомнить", replyToId: null, topicId: null, repeat: "week", sendAt: new Date(local).toISOString(), createdAt: new Date().toISOString() };
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([msg("привет")]),
      "POST /api/chats/c_1/messages/scheduled": { body: { scheduled: item } },
      "GET /api/chats/c_1/messages/scheduled": { body: { scheduled: [item] } },
      ...typingRoutes,
    });
    renderChat();
    await screen.findByText("привет");
    type("напомнить");
    sendMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Отправить позже" }));
    const dialog = screen.getByRole("dialog", { name: "Отправить позже" });
    // В группе «когда будет в сети» нет.
    expect(within(dialog).queryByRole("button", { name: "Отправить, когда будет в сети" })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Когда отправить"), { target: { value: local } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Повтор" }), { target: { value: "week" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Запланировать" }));

    const list = await screen.findByRole("dialog", { name: "Запланированные сообщения" });
    expect(await within(list).findByText("напомнить")).toBeTruthy();
    expect(within(list).getByText(/🔁 Каждую неделю/)).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/messages/scheduled")?.body).toEqual({
      text: "напомнить",
      replyToId: null,
      topicId: null,
      sendAt: new Date(local).toISOString(),
      repeat: "week",
      whenOnline: false,
    });
    expect((screen.getByRole("textbox", { name: "Сообщение" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("Hugo: находки над полем, исправление и повторная проверка", async () => {
    let checks = 0;
    fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([msg("привет")]),
      "POST /api/hugo/check": () => {
        checks += 1;
        return { body: { matches: checks === 1 ? [{ offset: 0, length: 6, message: "Орфографическая ошибка", short: "", replacements: ["привет", "превед"], type: "misspelling" }] : [], language: "ru" } };
      },
      ...typingRoutes,
    });
    renderChat();
    await screen.findByText("привет");
    type("превет всем");
    fireEvent.click(screen.getByTitle("Прикрепить"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Проверить текст (Hugo)" }));
    const panel = await screen.findByRole("region", { name: "Проверка текста" });
    expect(within(panel).getByText("Hugo нашёл 1 ошибку")).toBeTruthy();
    fireEvent.click(within(panel).getAllByRole("button", { name: "привет" })[0]!);
    expect((screen.getByRole("textbox", { name: "Сообщение" }) as HTMLTextAreaElement).value).toBe("привет всем");
    expect(await screen.findByText("Ошибок не нашлось")).toBeTruthy();
  });
});

describe("меню чата в шапке", () => {
  const openMenu = () => fireEvent.click(within(document.querySelector("header")!).getByRole("button", { name: "Ещё" }));
  const pick = (name: string | RegExp) => fireEvent.click(within(screen.getByRole("menu", { name: "Меню чата" })).getByRole("menuitem", { name }));
  const listed = (client: QueryClient) => client.getQueryData(chatQueries.list().queryKey)?.[0];

  it("уведомления: срок из списка, затем «Включить уведомления»", async () => {
    const until = "2026-10-27T10:00:00.000Z";
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([]),
      "POST /api/chats/c_1/mute": (body) => ({ body: { chat: { ...chat(), muted: !body.off, mutedUntil: body.off ? null : until } } }),
    });
    const { client } = renderChat();
    await screen.findByText("2 участника");

    openMenu();
    pick("Отключить уведомления");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Отключить уведомления" })).getByRole("button", { name: "На 8 часов" }));
    await waitFor(() => expect(listed(client)?.mutedUntil).toBe(until));
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/mute")?.body).toEqual({ hours: 8 });

    openMenu();
    pick("Включить уведомления");
    await waitFor(() => expect(listed(client)?.muted).toBe(false));
    expect(calls.filter((c) => c.key === "POST /api/chats/c_1/mute").at(-1)?.body).toEqual({ off: true });
  });

  it("админ группы включает и выключает темы", async () => {
    const admin = chat({ adminIds: [ME.id] });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(admin),
      [HISTORY]: page([msg("привет")]),
      "POST /api/chats/c_1/topics/enabled": (body) => ({
        body: { chat: body.enabled ? { ...admin, topicsEnabled: true } : admin, enabled: body.enabled, topics: [] },
      }),
    });
    renderChat(admin);
    await screen.findByText("привет");

    openMenu();
    pick("Включить темы");
    const tabs = await screen.findByRole("tablist", { name: "Темы" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Все", "#Общее"]);

    openMenu();
    pick("Выключить темы");
    fireEvent.click(await screen.findByRole("button", { name: "Да" }));
    await waitFor(() => expect(screen.queryByRole("tablist", { name: "Темы" })).toBeNull());
    expect(calls.filter((c) => c.key === "POST /api/chats/c_1/topics/enabled").map((c) => c.body)).toEqual([{ enabled: true }, { enabled: false }]);
  });

  it("очистить историю у себя — лента пустеет; архивировать — сразу в списке", async () => {
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: () => page(calls.some((c) => c.key === "POST /api/chats/c_1/clear") ? [] : [msg("старое")]),
      "POST /api/chats/c_1/clear": { body: { ok: true } },
      "PATCH /api/chats/c_1": { body: { chat: chat({ archived: true }) } },
      "GET /api/chats": { body: { chats: [chat()] } },
    });
    const { client } = renderChat();
    await screen.findByText("старое");

    openMenu();
    pick("Очистить историю");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Очистить историю чата" })).getByRole("button", { name: "Очистить только у себя" }));
    await waitFor(() => expect(screen.queryByText("старое")).toBeNull());
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/clear")?.body).toEqual({ forEveryone: false });

    openMenu();
    pick("Архивировать");
    expect(listed(client)?.archived).toBe(true);
    expect(calls.find((c) => c.key === "PATCH /api/chats/c_1")?.body).toEqual({ archived: true });
  });

  it("фон чата: «Только у меня» — в настройки, «Сбросить» у всех — общий фон чата", async () => {
    const SETTINGS = { chatWallpapers: {}, chatWallpaper: "default", chatWallpaperImage: null };
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(chat({ wallpaper: { id: "dots" } })),
      [HISTORY]: page([]),
      "GET /api/settings": { body: { settings: SETTINGS } },
      "POST /api/chats/c_1/wallpaper": (body) =>
        body.forEveryone ? { body: { chat: chat({ wallpaper: body.wallpaper }) } } : { body: { settings: { ...SETTINGS, chatWallpapers: { c_1: body.wallpaper } } } },
    });
    renderChat(chat({ wallpaper: { id: "dots" } }));
    await screen.findByText("2 участника");
    const feed = () => screen.getByRole("log", { name: "Сообщения" }).parentElement!.parentElement!;
    await waitFor(() => expect(feed().className).toMatch(/dots/));

    openMenu();
    pick("Фон чата");
    const dialog = screen.getByRole("dialog", { name: "Фон чата" });
    expect(within(dialog).getByTitle("Точки").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(dialog).getByTitle("Лес"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Поменять фон" })).getByRole("button", { name: "Только у меня" }));
    await waitFor(() => expect(feed().className).toMatch(/forest/));
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/wallpaper")?.body).toEqual({ wallpaper: { id: "forest" }, forEveryone: false, label: null });

    openMenu();
    pick("Фон чата");
    fireEvent.click(within(screen.getByRole("dialog", { name: "Фон чата" })).getByRole("button", { name: "Сбросить" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Сбросить фон" })).getByRole("button", { name: "У всех участников" }));
    await waitFor(() => expect(calls.filter((c) => c.key === "POST /api/chats/c_1/wallpaper")).toHaveLength(2));
    expect(calls.at(-1)?.body).toEqual({ wallpaper: null, forEveryone: true, label: null });
    // Свой фон этого чата важнее общего.
    expect(feed().className).toMatch(/forest/);
  });

  it("запланированные сообщения — список из меню", async () => {
    fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([]), "GET /api/chats/c_1/messages/scheduled": { body: { scheduled: [] } } });
    renderChat();
    await screen.findByText("2 участника");
    openMenu();
    pick("Запланированные сообщения");
    expect(await screen.findByText("Нет запланированных сообщений")).toBeTruthy();
  });

  it("личка: запрет пересылки без Premium — причина; «Удалить чат» у себя — из списка и на главную", async () => {
    const dm = chat({ type: "dm", title: null, otherUser: { ...LENA, online: false } as ChatSummary["otherUser"], protectedBy: [] });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(dm),
      [HISTORY]: page([]),
      "POST /api/chats/c_1/protect": { status: 402, body: { error: "Запрет пересылки доступен с Premium", premiumHelps: true } },
      "POST /api/chats/c_1/delete-for-me": { body: { ok: true } },
    });
    const { client, router } = renderChat(dm);
    await screen.findByText("был(а) недавно");

    openMenu();
    pick("Запретить пересылку");
    expect(await screen.findByText("Запрет пересылки доступен с Premium")).toBeTruthy();

    openMenu();
    pick("Удалить чат");
    const dialog = screen.getByRole("dialog", { name: "Удалить чат" });
    expect(within(dialog).getByText("Удалить чат с Лена?")).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: "Также удалить для Лена" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
    expect(await screen.findByText("Список чатов")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/");
    expect(calls.some((c) => c.key === "POST /api/chats/c_1/delete-for-me")).toBe(true);
    expect(client.getQueryData(chatQueries.list().queryKey)).toEqual([]);
  });

  it("участник группы: «Покинуть группу»", async () => {
    const { calls } = fakeApi({ "GET /api/chats/c_1": card(), [HISTORY]: page([]), "POST /api/chats/c_1/leave": { body: { ok: true, deleted: false } } });
    renderChat();
    await screen.findByText("2 участника");
    openMenu();
    pick("Группа: выйти или удалить");
    const dialog = screen.getByRole("dialog", { name: "Удалить группу" });
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Покинуть группу" }));
    expect(await screen.findByText("Список чатов")).toBeTruthy();
    expect(calls.some((c) => c.key === "POST /api/chats/c_1/leave")).toBe(true);
  });
});

describe("поиск по чату", () => {
  it("находки с автором; переход к старому — история подгружается, сообщение подсвечено", async () => {
    const old = msg("билеты на поезд", { createdAt: "2026-09-01T10:00:00.000Z" });
    const recent = msg("привет");
    const older = new URLSearchParams({ limit: "60", before: recent.createdAt, beforeId: recent.id });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(),
      [HISTORY]: page([recent], { hasMore: true }),
      [`GET /api/chats/c_1/messages?${older}`]: page([old], { hasMore: false }),
      "GET /api/chats/c_1/messages/search?q=%D0%B1%D0%B8%D0%BB%D0%B5%D1%82": { body: { messages: [old] } },
      "GET /api/chats/c_1/messages/search?q=%D0%B7%D0%BE%D0%BD%D1%82": { body: { messages: [] } },
    });
    renderChat();
    await screen.findByText("привет");

    fireEvent.click(within(document.querySelector("header")!).getByRole("button", { name: "Ещё" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Поиск по чату" }));
    const field = screen.getByRole("searchbox", { name: "Найти в этом чате" });
    fireEvent.change(field, { target: { value: "зонт" } });
    expect(await screen.findByText("Ничего не найдено")).toBeTruthy();

    fireEvent.change(field, { target: { value: "билет" } });
    const hit = await screen.findByRole("button", { name: /Лена.*билеты на поезд/ });
    fireEvent.click(hit);
    expect(screen.queryByRole("search")).toBeNull();
    await waitFor(() => expect(bubbles()).toEqual([old.id, recent.id]));
    await waitFor(() => expect(document.querySelector(`[data-message-id="${old.id}"]`)!.closest("[class*=highlight]")).toBeTruthy());
    expect(calls.filter((c) => c.key.includes("/search?")).length).toBe(2);
  });

  it("найденное не в открытой теме — переход во «Все»", async () => {
    const TOPIC = { id: "topic_a", chatId: "c_1", title: "Поездка", icon: "🎉", color: "#f80", closed: false, createdBy: LENA.id, createdAt: "2026-10-20T10:00:00.000Z" };
    const general = msg("билеты в общем");
    const inTopicMsg = msg("про поездку", { topicId: TOPIC.id });
    const c = chat({ topicsEnabled: true });
    fakeApi({
      "GET /api/chats/c_1": card(c),
      [HISTORY]: page([general, inTopicMsg]),
      [`${HISTORY}&topic=${TOPIC.id}`]: page([inTopicMsg]),
      "GET /api/chats/c_1/topics": { body: { enabled: true, topics: [TOPIC] } },
      "GET /api/chats/c_1/messages/search?q=%D0%B1%D0%B8%D0%BB%D0%B5%D1%82": { body: { messages: [general] } },
    });
    renderChat(c);
    const tabs = await screen.findByRole("tablist", { name: "Темы" });
    fireEvent.click(within(tabs).getByRole("tab", { name: /Поездка/ }));
    await waitFor(() => expect(bubbles()).toEqual([inTopicMsg.id]));

    fireEvent.click(within(document.querySelector("header")!).getByRole("button", { name: "Ещё" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Поиск по чату" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Найти в этом чате" }), { target: { value: "билет" } });
    fireEvent.click(await screen.findByRole("button", { name: /билеты в общем/ }));
    await waitFor(() => expect(bubbles()).toEqual([general.id, inTopicMsg.id]));
    expect(within(tabs).getByRole("tab", { name: "Все" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(document.querySelector(`[data-message-id="${general.id}"]`)!.closest("[class*=highlight]")).toBeTruthy());
  });
});

describe("информация о чате", () => {
  const openInfo = () => {
    fireEvent.click(within(document.querySelector("header")!).getByRole("button", { name: "Ещё" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Меню чата" })).getByRole("menuitem", { name: "Информация о чате" }));
    return screen.getByRole("complementary", { name: "Информация о чате" });
  };
  const dm = () => chat({ type: "dm", title: "", memberIds: [ME.id, LENA.id], otherUser: { ...LENA, online: true } as ChatSummary["otherUser"] });

  it("личка: профиль собеседника, автоудаление, блокировка и жалоба", async () => {
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(dm()),
      [HISTORY]: page([]),
      "GET /api/users/u_lena00000": {
        body: {
          user: { ...LENA, username: "lena", bio: "Люблю котов", phone: "+79990001122" },
          isContact: false,
          inContacts: false,
          contactName: null,
          contactNote: null,
          commonGroupsCount: 3,
          pinnedChannels: [],
        },
      },
      "PATCH /api/chats/c_1": (body) => ({ body: { chat: { ...dm(), autoDeleteSeconds: body.autoDeleteSeconds } } }),
      "POST /api/users/u_lena00000/block": { body: { user: null } },
      "POST /api/reports": { body: { ok: true } },
    });
    const { client } = renderChat(dm());
    await screen.findByText("в сети");
    const panel = openInfo();
    expect(within(panel).getByRole("heading", { name: "Профиль" })).toBeTruthy();
    expect(await within(panel).findByText("@lena")).toBeTruthy();
    expect(within(panel).getByText("+79990001122")).toBeTruthy();
    expect(within(panel).getByText("Люблю котов")).toBeTruthy();
    expect(within(panel).getByText("3 общие группы")).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Автоудаление сообщений: Выключено" }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Автоудаление сообщений" })).getByRole("menuitem", { name: "1 неделя" }));
    expect(await within(panel).findByRole("button", { name: "Автоудаление сообщений: 1 неделя" })).toBeTruthy();
    expect(calls.find((c) => c.key === "PATCH /api/chats/c_1")?.body).toEqual({ autoDeleteSeconds: 7 * 24 * 3600 });

    fireEvent.click(within(panel).getByRole("button", { name: "Заблокировать" }));
    expect(await screen.findByText("Вы заблокировали этого пользователя")).toBeTruthy();
    expect(client.getQueryData(sessionQueries.current().queryKey)?.user?.blockedUserIds).toEqual([LENA.id]);
    expect(calls.find((c) => c.key === "POST /api/users/u_lena00000/block")?.body).toEqual({ blocked: true });
    expect(within(panel).getByRole("button", { name: "Разблокировать" })).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Пожаловаться" }));
    const report = screen.getByRole("dialog", { name: "Пожаловаться на Лена" });
    fireEvent.click(within(report).getByRole("button", { name: "Отправить жалобу" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Пожаловаться на Лена" })).toBeNull());
    expect(calls.find((c) => c.key === "POST /api/reports")?.body).toEqual({ targetType: "user", targetId: LENA.id, reason: "spam", details: "" });

    fireEvent.click(within(panel).getByTitle("Закрыть"));
    expect(screen.queryByRole("complementary", { name: "Информация о чате" })).toBeNull();
  });

  it("группа: описание, ссылка, участники с ролями, уведомления", async () => {
    const group = chat({ ownerId: LENA.id, description: "Наш семейный чат", isPublic: true, username: "family", memberTitles: {} });
    const { calls } = fakeApi({
      "GET /api/chats/c_1": card(group),
      [HISTORY]: page([]),
      "POST /api/chats/c_1/mute": { body: { chat: { ...group, muted: true, mutedUntil: null } } },
    });
    renderChat(group);
    await screen.findByText("2 участника");
    const panel = openInfo();
    expect(within(panel).getByRole("heading", { name: "Группа" })).toBeTruthy();
    expect(within(panel).getByText("Наш семейный чат")).toBeTruthy();
    expect(within(panel).getByText("https://shalter.ru/u/family")).toBeTruthy();
    // Автоудаление в группе ставят только админы.
    expect(within(panel).queryByRole("button", { name: /Автоудаление/ })).toBeNull();

    const members = within(panel).getByRole("region", { name: "Участники" });
    const rows = (await within(members).findAllByText(/^(Лена|Аня)$/)).map((el) => el.textContent);
    expect(rows).toEqual(["Лена", "Аня"]);
    expect(within(members).getByText(/владелец/)).toBeTruthy();
    expect(within(members).getByText("это вы")).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Отключить уведомления" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Отключить уведомления" })).getByRole("button", { name: "Навсегда" }));
    expect(await within(panel).findByRole("button", { name: "Включить уведомления" })).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/chats/c_1/mute")?.body).toEqual({ forever: true });
    expect(within(panel).getByRole("button", { name: "Пожаловаться на группу" })).toBeTruthy();
  });

  describe("управление участниками", () => {
    const OLYA = { id: "u_olya00000", name: "Оля", username: "olya" };
    /** Сервер: роли меняются по запросам, карточка отдаёт текущее состояние. */
    function server(start: ChatSummary) {
      let state = start;
      let members: object[] = [ME, LENA];
      const reply = (patch: Partial<ChatSummary>) => {
        state = { ...state, ...patch };
        return { body: { chat: state } };
      };
      return fakeApi({
        "GET /api/chats/c_1": () => ({ body: { chat: state, members, commands: null, paidMessages: null } }),
        [HISTORY]: page([]),
        "POST /api/chats/c_1/members": (body) => {
          if (body.role === "promote") return reply({ adminIds: [...state.adminIds, String(body.userId)] });
          if (body.role === "add") {
            members = [...members, OLYA];
            return reply({ memberIds: [...state.memberIds, String(body.userId)], membersCount: state.membersCount + 1 });
          }
          return reply({});
        },
        "POST /api/chats/c_1/title": (body) => reply({ memberTitles: { ...state.memberTitles, [String(body.userId)]: body.title } }),
        "POST /api/chats/c_1/restrict": (body) => reply({ restrictions: body.until ? { [String(body.userId)]: body.until } : {} }),
        "GET /api/contacts": { body: { contacts: [{ user: LENA }, { user: OLYA }] } },
      });
    }
    const memberMenu = async (panel: HTMLElement, name: string) => {
      const members = within(panel).getByRole("region", { name: "Участники" });
      const row = (await within(members).findByText(name)).closest<HTMLElement>('[class*="_member_"]')!;
      fireEvent.click(within(row).getByTitle("Действия с участником"));
      return screen.getByRole("menu", { name });
    };

    it("владелец: админ, тег, запрет писать и передача прав", async () => {
      const { calls } = server(chat({ ownerId: ME.id }));
      renderChat(chat({ ownerId: ME.id }));
      await screen.findByText("2 участника");
      const panel = openInfo();

      fireEvent.click(within(await memberMenu(panel, "Лена")).getByRole("menuitem", { name: "Сделать администратором" }));
      expect(await within(panel).findByText(/админ/)).toBeTruthy();
      expect(calls.find((c) => c.key === "POST /api/chats/c_1/members")?.body).toEqual({ userId: LENA.id, role: "promote" });

      fireEvent.click(within(await memberMenu(panel, "Лена")).getByRole("menuitem", { name: "Изменить тег" }));
      const ask = screen.getByRole("dialog", { name: /Тег для Лена/ });
      fireEvent.change(within(ask).getByRole("textbox"), { target: { value: "Сестра" } });
      fireEvent.click(within(ask).getByRole("button", { name: "Готово" }));
      expect(await within(panel).findByText(/Сестра/)).toBeTruthy();
      expect(calls.find((c) => c.key === "POST /api/chats/c_1/title")?.body).toEqual({ userId: LENA.id, title: "Сестра" });

      fireEvent.click(within(await memberMenu(panel, "Лена")).getByRole("menuitem", { name: "Запретить писать" }));
      fireEvent.click(within(screen.getByRole("dialog", { name: "Запретить писать: Лена" })).getByRole("button", { name: "Навсегда" }));
      expect(await within(panel).findByTitle("Не может писать")).toBeTruthy();
      expect(calls.find((c) => c.key === "POST /api/chats/c_1/restrict")?.body).toEqual({ userId: LENA.id, until: "forever" });
      expect(within(await memberMenu(panel, "Лена")).getByRole("menuitem", { name: "Разрешить писать" })).toBeTruthy();
      fireEvent.keyDown(document, { key: "Escape" });

      fireEvent.click(within(await memberMenu(panel, "Лена")).getByRole("menuitem", { name: "Передать права владельца" }));
      fireEvent.click(within(screen.getByRole("dialog", { name: /Передать Лена права владельца группы/ })).getByRole("button", { name: "Да" }));
      await waitFor(() => expect(calls.filter((c) => c.key === "POST /api/chats/c_1/members").at(-1)?.body).toEqual({ userId: LENA.id, role: "transfer" }));
    });

    it("админ добавляет участников из контактов", async () => {
      const { calls } = server(chat({ adminIds: [ME.id], ownerId: LENA.id }));
      renderChat(chat({ adminIds: [ME.id], ownerId: LENA.id }));
      await screen.findByText("2 участника");
      const panel = openInfo();
      // Владельца админ не трогает.
      const members = within(panel).getByRole("region", { name: "Участники" });
      await within(members).findByText("Лена");
      expect(within(members).queryByTitle("Действия с участником")).toBeNull();

      fireEvent.click(within(panel).getByTitle("Добавить участника"));
      const dialog = screen.getByRole("dialog", { name: "Добавить участников" });
      // Кто уже в чате — не предлагаем.
      const olya = await within(dialog).findByRole("checkbox", { name: /Оля/ });
      expect(within(dialog).queryByRole("checkbox", { name: /Лена/ })).toBeNull();
      const add = within(dialog).getByRole("button", { name: "Добавить" });
      expect((add as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(olya);
      fireEvent.click(add);
      expect(await within(members).findByText("Оля")).toBeTruthy();
      expect(calls.find((c) => c.key === "POST /api/chats/c_1/members")?.body).toEqual({ userId: OLYA.id, role: "add" });
      expect(screen.queryByRole("dialog", { name: "Добавить участников" })).toBeNull();
    });

    it("участник: без меню и добавления, но свой тег", async () => {
      const { calls } = server(chat({ ownerId: LENA.id }));
      renderChat(chat({ ownerId: LENA.id }));
      await screen.findByText("2 участника");
      const panel = openInfo();
      const members = within(panel).getByRole("region", { name: "Участники" });
      await within(members).findByText("Лена");
      expect(within(members).queryByTitle("Действия с участником")).toBeNull();
      expect(within(panel).queryByTitle("Добавить участника")).toBeNull();

      fireEvent.click(within(members).getByTitle("Мой тег"));
      const ask = screen.getByRole("dialog", { name: /Ваш тег в группе/ });
      fireEvent.change(within(ask).getByRole("textbox"), { target: { value: "Младшая" } });
      fireEvent.click(within(ask).getByRole("button", { name: "Готово" }));
      expect(await within(members).findByText(/Младшая/)).toBeTruthy();
      expect(calls.find((c) => c.key === "POST /api/chats/c_1/title")?.body).toEqual({ userId: ME.id, title: "Младшая" });
    });
  });
});
