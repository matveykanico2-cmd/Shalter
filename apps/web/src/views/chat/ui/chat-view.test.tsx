import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatQueries, type ChatSummary } from "@/entities/chat";
import type { Message } from "@/entities/message";
import { sessionQueries } from "@/entities/session";

import { ws } from "@/shared/api";
import { fakeApi, FakeSocket, fakeSocket, FakeXhr, fakeXhr } from "@/shared/lib/test";
import { Toaster } from "@/shared/ui";

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
