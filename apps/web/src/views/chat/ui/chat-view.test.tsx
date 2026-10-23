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
      <Toaster />
      <AskHost />
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
    expect(menuItems()).toEqual(["Ответить", "Переслать", "Копировать текст", "Копировать ссылку", "Изменить", "Удалить"]);
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
    fireEvent.click(screen.getByTitle("Ещё"));
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
    expect(screen.queryByTitle("Отправить")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Голосовое сообщение" }));
    const bar = await screen.findByRole("group", { name: "Запись голосового" });
    await waitFor(() => expect(within(bar).getByTitle("Отправить")).toHaveProperty("disabled", false));
    expect(calls.some((c) => c.key === "POST /api/chats/c_1/typing" && (c.body as { action: string }).action === "record_voice")).toBe(true);

    fireEvent.click(within(bar).getByTitle("Отправить"));
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
    expect(screen.getByTitle("Отправить")).toBeTruthy();
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
