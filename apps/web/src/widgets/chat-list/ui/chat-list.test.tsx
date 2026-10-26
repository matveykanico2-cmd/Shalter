import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ChatFolder, chatQueries, type ChatSummary } from "@/entities/chat";
import { sessionQueries } from "@/entities/session";

import { ws } from "@/shared/api";
import { fakeApi, FakeSocket,fakeSocket } from "@/shared/lib/test";

import { ChatList } from "./chat-list";

const ME = "u_me0000000";

let seq = 0;
function chat(patch: Partial<ChatSummary> & { title: string }): ChatSummary {
  seq += 1;
  return {
    id: `c_${seq}`,
    type: "group",
    commentsOff: false,
    permissions: null,
    adminIds: [],
    moderatorIds: [],
    ownerIds: [],
    memberTitles: {},
    memberIds: [ME],
    membersCount: 1,
    pinned: false,
    muted: false,
    mutedUntil: null,
    commentPriceStars: 0,
    archived: false,
    createdAt: "2026-10-01T10:00:00.000Z",
    wallpaper: null,
    allowedReactions: null,
    restrictions: {},
    warnings: {},
    bannedIds: [],
    protectedBy: [],
    points: 0,
    votes: {},
    pinOrder: null,
    lastMessage: null,
    unreadCount: 0,
    hasUnreadMention: false,
    otherUser: null,
    draft: null,
    ...patch,
  } as ChatSummary;
}

function message(chatId: string, text: string, createdAt: string, senderId = "u_other0000") {
  return { id: `m_${text}`, chatId, senderId, type: "text", text, createdAt, pinned: false, replyToId: null, reactions: [], readByIds: [], deletedForIds: [], mentionedUserIds: [], views: null };
}

function renderList(chats: ChatSummary[], folders: ChatFolder[] = [], path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(chatQueries.list().queryKey, chats);
  client.setQueryData(chatQueries.folders().queryKey, folders);
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <ChatList meId={ME} />,
        children: [{ path: "chat/:chatId", element: null }],
      },
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { client, router };
}

const titles = () => screen.queryAllByRole("link").map((a) => a.querySelector("span span span")?.textContent);

beforeEach(() => {
  seq = 0;
  // В jsdom у элементов нет размеров — без этого виртуализатор не покажет ни одной строки.
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(380);
  fakeSocket();
  fakeApi({});
  try {
    localStorage.clear();
  } catch {
    // нет хранилища
  }
});

afterEach(() => {
  ws.stop();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("список чатов", () => {
  it("закреплённые сверху по порядку, остальные — по последнему сообщению; превью, «Вы:», черновик", () => {
    const a = chat({ title: "Старый" });
    const b = chat({ title: "Свежий" });
    renderList([
      { ...a, lastMessage: message(a.id, "привет", "2026-10-20T10:00:00.000Z") },
      { ...b, lastMessage: message(b.id, "**жирно**", "2026-10-21T10:00:00.000Z", ME) },
      chat({ title: "Второй закреп", pinned: true, pinOrder: 2 }),
      chat({ title: "Первый закреп", pinned: true, pinOrder: 1, draft: "набираю" }),
    ]);
    expect(titles()).toEqual(["Первый закреп", "Второй закреп", "Свежий", "Старый"]);
    expect(screen.getByText("Вы: жирно")).toBeTruthy();
    expect(screen.getByText("Черновик:").parentElement?.textContent).toBe("Черновик: набираю");
    expect(screen.getAllByText("Нет сообщений")).toHaveLength(1);
  });

  it("вкладки: личные, группы, каналы, папки; счётчик непрочитанных; архив — отдельной строкой", () => {
    const dm = chat({ title: "Лена", type: "dm", unreadCount: 3, otherUser: { id: "u_lena000000", name: "Лена" } as ChatSummary["otherUser"] });
    const channel = chat({ title: "Новости", type: "channel" });
    const group = chat({ title: "Семья" });
    const old = chat({ title: "Старая группа", archived: true, unreadCount: 1 });
    renderList([dm, channel, group, old], [{ id: "f_1", ownerId: ME, name: "Работа", order: 0, chatIds: [group.id] }]);

    expect(titles()).toEqual(["Лена", "Новости", "Семья"]);
    const archive = screen.getByRole("button", { name: /Архив/ });
    expect(archive.textContent).toContain("Старая группа");

    const tab = (name: RegExp) => screen.getByRole("tab", { name });
    expect(tab(/^Личные/).textContent).toBe("Личные1");
    fireEvent.click(tab(/^Личные/));
    expect(titles()).toEqual(["Лена"]);
    expect(screen.queryByRole("button", { name: /Архив/ })).toBeNull();
    fireEvent.click(tab(/^Каналы/));
    expect(titles()).toEqual(["Новости"]);
    fireEvent.click(tab(/^Работа/));
    expect(titles()).toEqual(["Семья"]);
    fireEvent.click(tab(/^Группы/));
    expect(titles()).toEqual(["Семья"]);
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Группы");

    fireEvent.click(tab(/^Все/));
    fireEvent.click(screen.getByRole("button", { name: /Архив/ }));
    expect(titles()).toEqual(["Старая группа"]);
    fireEvent.click(screen.getByTitle("Назад к чатам"));
    expect(titles()).toEqual(["Лена", "Новости", "Семья"]);
  });

  it("пустая вкладка; «только непрочитанные» запоминается и оставляет открытый чат", () => {
    const read = chat({ title: "Прочитан" });
    const unread = chat({ title: "Есть новое", unread: true });
    renderList([read, unread], [], `/chat/${read.id}`);
    fireEvent.click(screen.getByRole("tab", { name: "Каналы" }));
    expect(screen.getByText("Вы пока не подписаны ни на один канал")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /^Все/ }));

    fireEvent.click(screen.getByTitle("Только непрочитанные"));
    expect(titles()).toEqual(["Прочитан", "Есть новое"]);
    expect(localStorage.getItem("shalter.chatList.unreadOnly")).toBe("1");
    cleanup();
    renderList([read, unread]);
    expect(titles()).toEqual(["Есть новое"]);
    expect(screen.getByTitle("Показать все чаты").getAttribute("aria-pressed")).toBe("true");
  });

  it("открытый чат выделен", () => {
    const a = chat({ title: "Один" });
    const b = chat({ title: "Два" });
    renderList([a, b], [], `/chat/${b.id}`);
    expect(screen.getByRole("link", { current: "page" }).getAttribute("href")).toBe(`/chat/${b.id}`);
  });
});

describe("список чатов и сокет", () => {
  it("message:new — сразу в превью и наверх; сверка с сервером — через 1,2 с, одна на пачку", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const a = chat({ title: "Первый", lastMessage: null, createdAt: "2026-10-02T10:00:00.000Z" });
    const b = chat({ title: "Второй", createdAt: "2026-10-01T10:00:00.000Z" });
    let onServer = [a, b];
    const { calls } = fakeApi({ "GET /api/chats": () => ({ body: { chats: onServer } }), "GET /api/folders": { body: { folders: [] } } });
    renderList([a, b]);
    ws.start();
    act(() => FakeSocket.last().open());
    await act(() => vi.advanceTimersByTimeAsync(0));
    calls.length = 0;

    // Кэш оповещает подписчиков в следующем тике.
    const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
    act(() => FakeSocket.last().receive({ type: "message:new", chatId: b.id, message: message(b.id, "раз", "2026-10-22T10:00:00.000Z") }));
    await flush();
    expect(titles()).toEqual(["Второй", "Первый"]);
    expect(screen.getByText("раз")).toBeTruthy();
    act(() => FakeSocket.last().receive({ type: "message:new", chatId: b.id, message: message(b.id, "два", "2026-10-22T10:00:01.000Z") }));
    await flush();
    expect(screen.getByText("два")).toBeTruthy();

    onServer = [a, { ...b, lastMessage: message(b.id, "три", "2026-10-22T10:00:02.000Z"), unreadCount: 3 }];
    await act(() => vi.advanceTimersByTimeAsync(1199));
    expect(calls).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls.map((c) => c.key).sort()).toEqual(["GET /api/chats", "GET /api/folders"]);
    await act(() => vi.advanceTimersByTimeAsync(50));
    const row = screen.getByRole("link", { name: /Второй/ });
    expect(within(row).getByText("три")).toBeTruthy();
    expect(within(row).getByText("3")).toBeTruthy();
  });

  it("chat:deleted — строка пропадает, открытый чат закрывается; presence:update — точка «в сети»", async () => {
    const dm = chat({ title: "Лена", type: "dm", otherUser: { id: "u_lena000000", name: "Лена", online: false } as ChatSummary["otherUser"] });
    const gone = chat({ title: "Удалят" });
    const { router } = renderList([dm, gone], [], `/chat/${gone.id}`);
    ws.start();
    act(() => FakeSocket.last().open());

    const dot = () => screen.getByRole("link", { name: /Лена/ }).querySelector("[class*=online]");
    expect(dot()).toBeNull();
    act(() => FakeSocket.last().receive({ type: "presence:update", userId: "u_lena000000", online: true }));
    await waitFor(() => expect(dot()).toBeTruthy());

    act(() => FakeSocket.last().receive({ type: "chat:deleted", chatId: gone.id }));
    await waitFor(() => expect(titles()).toEqual(["Лена"]));
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("действия со строками", () => {
  const withMe = (client: QueryClient) => client.setQueryData(sessionQueries.current().queryKey, { user: { id: ME, name: "Аня", blockedUserIds: [] } } as never);
  const rowOf = (title: string) => screen.getByRole("link", { name: new RegExp(title) }).parentElement!;

  it("меню строки: закрепить, в папку, прочитано; правая кнопка на вкладке — «Прочитать все»", async () => {
    const work = chat({ title: "Работа", unreadCount: 3 });
    const home = chat({ title: "Дом", unreadCount: 1 });
    const folder: ChatFolder = { id: "f_1", name: "Важное", chatIds: [], emoji: null } as unknown as ChatFolder;
    const { calls } = fakeApi({
      [`PATCH /api/chats/${work.id}`]: { body: { ok: true } },
      "PATCH /api/folders/f_1": { body: { folder: { ...folder, chatIds: [work.id] } } },
      [`POST /api/chats/${work.id}/read`]: { body: { ok: true } },
      [`POST /api/chats/${home.id}/read`]: { body: { ok: true } },
    });
    const { client } = renderList([work, home], [folder]);
    withMe(client);
    fireEvent.contextMenu(rowOf("Работа"), { clientX: 10, clientY: 10 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Закрепить" }));
    await waitFor(() => expect(calls.find((c) => c.key === `PATCH /api/chats/${work.id}`)?.body).toEqual({ pinned: true }));

    fireEvent.click(within(rowOf("Работа")).getByRole("button", { name: "Действия с чатом" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Добавить в папку" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Важное" }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /api/folders/f_1")?.body).toEqual({ chatIds: [work.id] }));

    fireEvent.contextMenu(screen.getByRole("tab", { name: /Все/ }), { clientX: 5, clientY: 5 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Прочитать все (2)" }));
    await waitFor(() => expect(calls.filter((c) => c.key.endsWith("/read"))).toHaveLength(2));
    expect(screen.queryByText("3")).toBeNull();
  });

  it("свайп пальцем влево: на 72 px — без звука, на 144 px — в архив", async () => {
    const work = chat({ title: "Работа" });
    const { calls } = fakeApi({
      [`POST /api/chats/${work.id}/mute`]: { body: { chat: { ...work, muted: true, mutedUntil: null } } },
      [`PATCH /api/chats/${work.id}`]: { body: { ok: true } },
    });
    const { client } = renderList([work]);
    withMe(client);
    const row = rowOf("Работа");
    const swipe = (dx: number) => {
      fireEvent.pointerDown(row, { pointerType: "touch", clientX: 300, clientY: 20 });
      fireEvent.pointerMove(row, { pointerType: "touch", clientX: 300 + dx, clientY: 22 });
      fireEvent.pointerUp(row, { pointerType: "touch", clientX: 300 + dx, clientY: 22 });
    };
    swipe(-90);
    await waitFor(() => expect(calls.find((c) => c.key === `POST /api/chats/${work.id}/mute`)?.body).toEqual({ forever: true }));
    swipe(-160);
    await waitFor(() => expect(calls.find((c) => c.key === `PATCH /api/chats/${work.id}`)?.body).toEqual({ archived: true }));
  });
});
