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

const titles = () =>
  screen
    .queryAllByRole("button", { name: /\S/ })
    .map((b) => b.querySelector("[class*=title]")?.textContent)
    .filter((t): t is string => !!t && t !== "Архив");

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

    const tab = (name: RegExp) => screen.getByRole("button", { name });
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
    expect(screen.getByRole("button", { pressed: true, name: /^Группы/ }).textContent).toBe("Группы");
    // Ctrl+2 из горячих клавиш — вторая вкладка («Личные»).
    act(() => void window.dispatchEvent(new CustomEvent("shalter:chat-tab", { detail: 1 })));
    expect(titles()).toEqual(["Лена"]);

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
    fireEvent.click(screen.getByRole("button", { name: "Каналы" }));
    expect(screen.getByText("Вы пока не подписаны ни на один канал")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Все/ }));

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
    expect(screen.getByRole("button", { current: "page" }).textContent).toContain("Два");
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
    const row = screen.getByRole("button", { name: /Второй/ });
    expect(within(row).getByText("три")).toBeTruthy();
    expect(within(row).getByText("3")).toBeTruthy();
  });

  it("chat:deleted — строка пропадает, открытый чат закрывается; presence:update — точка «в сети»", async () => {
    const dm = chat({ title: "Лена", type: "dm", otherUser: { id: "u_lena000000", name: "Лена", online: false } as ChatSummary["otherUser"] });
    const gone = chat({ title: "Удалят" });
    const { router } = renderList([dm, gone], [], `/chat/${gone.id}`);
    ws.start();
    act(() => FakeSocket.last().open());

    const dot = () => screen.getByRole("button", { name: /Лена/ }).querySelector("[class*=online]");
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
  const rowOf = (title: string) => screen.getByRole("button", { name: new RegExp(title) }).parentElement!;

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
    fireEvent.click(await screen.findByRole("button", { name: "Закрепить" }));
    await waitFor(() => expect(calls.find((c) => c.key === `PATCH /api/chats/${work.id}`)?.body).toEqual({ pinned: true }));

    fireEvent.click(within(rowOf("Работа")).getByRole("button", { name: "Действия с чатом" }));
    fireEvent.click(await screen.findByRole("button", { name: "Добавить в папку" }));
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("button", { name: "Важное" }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /api/folders/f_1")?.body).toEqual({ chatIds: [work.id] }));

    fireEvent.contextMenu(screen.getByRole("button", { name: /^Все/ }), { clientX: 5, clientY: 5 });
    fireEvent.click(await screen.findByRole("button", { name: "Прочитать все (2)" }));
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

describe("поиск", () => {
  it("свои чаты, люди и сообщения с фильтрами; найденное открывается, поиск закрывается", async () => {
    const lena = chat({ title: "", type: "dm", otherUser: { id: "u_lena00000", name: "Лена" } as ChatSummary["otherUser"] });
    const work = chat({ title: "Работа" });
    const found = message(work.id, "купи лейку", "2026-10-20T10:00:00.000Z");
    const { calls } = fakeApi({
      [`GET /api/search?q=${encodeURIComponent("ле")}`]: {
        body: { chats: [lena], channels: [], users: [{ id: "u_lev0000000", name: "Лев", username: "lev" }], bots: [], games: [], messages: [found] },
      },
      "POST /api/chats": { body: { chat: chat({ title: "", id: "c_lev", type: "dm" }) } },
      "GET /api/chats": { body: { chats: [] } },
    });
    const { router } = renderList([lena, work]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск" }), { target: { value: "ле" } });
    const chips = await screen.findByRole("tablist", { name: "Что искать" });
    expect(within(chips).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Все", "Личные 1", "Люди 1", "Сообщения 1"]);
    expect(screen.getByRole("region", { name: "Личные" })).toBeTruthy();
    expect(screen.getByText("ле", { selector: "mark" })).toBeTruthy();

    fireEvent.click(within(chips).getByRole("tab", { name: "Люди 1" }));
    expect(screen.queryByRole("region", { name: "Сообщения" })).toBeNull();
    fireEvent.click(within(chips).getByRole("tab", { name: "Все" }));

    fireEvent.click(screen.getByRole("button", { name: /купи/ }));
    await waitFor(() => expect(router.state.location.search).toBe(`?msg=${encodeURIComponent(found.id)}`));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ле" } });
    fireEvent.click(await screen.findByRole("button", { name: /Лев/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_lev"));
    expect(calls.find((c) => c.key === "POST /api/chats")?.body).toMatchObject({ userId: "u_lev0000000", title: "Лев" });
  });
});

describe("новый чат", () => {
  it("«Новая группа»: участники с админом → название и тип → создана, ссылка-приглашение; «Новый канал»: название → подписчики", async () => {
    const lena = { id: "u_lena00000", name: "Лена", username: "lena" };
    const { calls } = fakeApi({
      "GET /api/contacts": { body: { contacts: [{ user: lena, localName: null }] } },
      "POST /api/chats/groups": { body: { chat: chat({ title: "Семья", id: "c_new" }) } },
      "POST /api/chats/c_new/invite": { body: { code: "AbCdEfGhIjKlMnOpQrStUv", chat: chat({ title: "Семья", id: "c_new" }) } },
      "POST /api/chats/channels": { body: { chat: chat({ title: "Новости", id: "c_ch", type: "channel" }) } },
      "POST /api/chats/c_ch/invite": { body: { code: "ZyXwVuTsRqPoNmLkJiHgFe", chat: chat({ title: "Новости", id: "c_ch" }) } },
      "GET /api/chats": { body: { chats: [] } },
    });
    const { client, router } = renderList([chat({ title: "Работа" })]);
    client.setQueryData(sessionQueries.current().queryKey, { user: { id: ME, name: "Аня", blockedUserIds: [] } } as never);
    fireEvent.click(await screen.findByRole("button", { name: "Новый чат" }));
    fireEvent.click(await screen.findByRole("button", { name: "Новая группа" }));
    const picker = await screen.findByRole("dialog", { name: "Добавить участников" });
    fireEvent.click(await within(picker).findByRole("button", { name: /Лена/ }));
    fireEvent.click(within(picker).getByRole("button", { name: "Сделать администратором" }));
    fireEvent.click(within(picker).getByRole("button", { name: "Далее" }));
    const details = await screen.findByRole("dialog", { name: "Новая группа" });
    expect(within(details).getByText("1 участник")).toBeTruthy();
    fireEvent.change(within(details).getByRole("textbox", { name: "Название группы" }), { target: { value: "Семья" } });
    fireEvent.click(within(details).getByRole("button", { name: "Далее" }));
    expect(await screen.findByRole("dialog", { name: "Группа создана" })).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/chats/groups")?.body).toMatchObject({ title: "Семья", memberIds: [lena.id], adminIds: [lena.id], isPublic: false });
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_new"));
    expect(((await screen.findByRole("textbox", { name: "Ссылка" })) as HTMLInputElement).value).toMatch(/\/join\/AbCdEfGhIjKlMnOpQrStUv$/);
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    fireEvent.click(screen.getByRole("button", { name: "Новый чат" }));
    fireEvent.click(await screen.findByRole("button", { name: "Новый канал" }));
    const info = await screen.findByRole("dialog", { name: "Новый канал" });
    fireEvent.change(within(info).getByRole("textbox", { name: "Название канала" }), { target: { value: "Новости" } });
    fireEvent.click(within(info).getByRole("radio", { name: /Публичный канал/ }));
    fireEvent.change(within(info).getByRole("textbox", { name: /Юзернейм/ }), { target: { value: "@news_ch!" } });
    fireEvent.click(within(info).getByRole("button", { name: "Далее" }));
    const subs = await screen.findByRole("dialog", { name: "Добавить подписчиков" });
    fireEvent.click(within(subs).getByRole("button", { name: "Создать канал" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_ch"));
    expect(calls.find((c) => c.key === "POST /api/chats/channels")?.body).toMatchObject({ title: "Новости", memberIds: [], isPublic: true, username: "news_ch" });
  });
});
