// Статьи (Premium) в открытом чате: окно из скрепки, обложка загрузкой, временный пузырь
// сразу статьёй, правка своей статьи в том же окне. Помощники — как в chat-view.test.tsx.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chatQueries, type ChatSummary } from "@/entities/chat";
import type { Message } from "@/entities/message";
import { sessionQueries } from "@/entities/session";

import { ws } from "@/shared/api";
import { fakeApi, fakeSocket, FakeXhr, fakeXhr } from "@/shared/lib/test";
import { AskHost, BrowserHost, Toaster } from "@/shared/ui";

import { ChatView } from "./chat-view";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[], isPremium: true };
const LENA = { id: "u_lena00000", name: "Лена" };
const HISTORY = "GET /api/chats/c_1/messages?limit=60";
const SEND = "POST /api/chats/c_1/messages";

const chat = {
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
  unreadCount: 0,
  hasUnreadMention: false,
  otherUser: null,
  draft: null,
} as unknown as ChatSummary;

const msg = (id: string, text: string, patch: Partial<Message> = {}): Message => ({
  id,
  chatId: "c_1",
  senderId: ME.id,
  type: "text",
  text,
  createdAt: "2026-10-22T10:05:00.000Z",
  pinned: false,
  replyToId: null,
  reactions: [],
  readByIds: [],
  deletedForIds: [],
  mentionedUserIds: [],
  views: null,
  ...patch,
});

const page = (messages: Message[]) => ({ body: { messages, hasMore: false, firstUnreadId: null, replyTargets: {} } });
const routes = {
  "GET /api/chats/c_1": { body: { chat, members: [ME, LENA], commands: null, paidMessages: null } },
  "POST /api/chats/c_1/draft": { body: { ok: true } },
  "POST /api/chats/c_1/typing": { body: { ok: true } },
};

function renderChat(me = ME) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: me } as never);
  client.setQueryData(chatQueries.list().queryKey, [chat]);
  const router = createMemoryRouter([{ path: "/chat/:chatId", element: <ChatView /> }], { initialEntries: ["/chat/c_1"] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <BrowserHost />
      <Toaster />
      <AskHost />
    </QueryClientProvider>
  );
}

const openArticleItem = () => {
  fireEvent.click(screen.getByTitle("Вложение"));
  fireEvent.click(screen.getByRole("button", { name: "Статья (Premium)" }));
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(600);
  fakeSocket();
});

afterEach(() => {
  ws.stop();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("статьи", () => {
  it("без Premium — подсказка, окна нет", async () => {
    fakeApi({ ...routes, [HISTORY]: page([]) });
    renderChat({ ...ME, isPremium: false });
    await screen.findByText("Сообщений пока нет — напишите первым");
    openArticleItem();
    expect(await screen.findByText("Создание статей доступно только Premium")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Создать статью" })).toBeNull();
  });

  it("окно: обложка загрузкой, «# Заголовок» + тело, article: true; пузырь сразу статьёй", async () => {
    fakeXhr();
    const { calls } = fakeApi({ ...routes, [HISTORY]: page([]), [SEND]: (body) => ({ body: { message: msg("m_new", String(body.text), { type: "article", attachments: body.attachments as unknown[] }) } }) });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");
    openArticleItem();
    const dialog = screen.getByRole("dialog", { name: "Создать статью" });
    const publish = within(dialog).getByRole("button", { name: "Опубликовать" }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);

    // Обложка больше 10 МБ — отказ, картинка — превью.
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByTestId("article-cover"), { target: { files: [big] } });
    expect(within(dialog).getByRole("alert").textContent).toBe("Файл слишком большой (макс. 10 МБ)");
    fireEvent.change(screen.getByTestId("article-cover"), { target: { files: [new File(["x"], "cover.png", { type: "image/png" })] } });
    expect(within(dialog).getByRole("img", { name: "Обложка" })).toBeTruthy();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Заголовок статьи" }), { target: { value: "Кофе" } });
    const body = within(dialog).getByRole("textbox", { name: "Текст статьи" }) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "Зёрна" } });
    // «Заголовок» ставит «## » в начало строки, повтор — убирает; «Жирный» оборачивает выделенное.
    body.setSelectionRange(2, 2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Заголовок" }));
    expect(body.value).toBe("## Зёрна");
    fireEvent.click(within(dialog).getByRole("button", { name: "Заголовок" }));
    expect(body.value).toBe("Зёрна");
    body.setSelectionRange(0, 5);
    fireEvent.click(within(dialog).getByRole("button", { name: "Жирный" }));
    expect(body.value).toBe("**Зёрна**");
    fireEvent.change(body, { target: { value: "**Зёрна** — арабика.\n- обжарка" } });

    fireEvent.click(publish);
    expect(within(dialog).getByRole("button", { name: "Публикация…" })).toBeTruthy();
    await waitFor(() => expect(FakeXhr.requests).toHaveLength(1));
    expect(FakeXhr.requests[0]!.params.kind).toBe("image");
    act(() => FakeXhr.requests[0]!.respond(200, { url: "/uploads/cover", name: "cover.png" }));

    // Временный пузырь — уже карточкой статьи.
    expect(await screen.findByRole("article", { name: "Кофе" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Создать статью" })).toBeNull());
    await waitFor(() => expect(calls.some((c) => c.key === SEND)).toBe(true));
    const sent = calls.find((c) => c.key === SEND)!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ text: "# Кофе\n\n**Зёрна** — арабика.\n- обжарка", article: true, attachments: [{ kind: "image", url: "/uploads/cover" }] });
    expect(String(sent.text)).toMatch(/^# Кофе/);
    expect(sent.clientId).toMatch(/^local_/);
  });

  it("отказ сервера — окно снова с черновиком и причиной над полем", async () => {
    fakeApi({ ...routes, [HISTORY]: page([]), [SEND]: { status: 403, body: { error: "Создание статей доступно только с Shalter Premium" } } });
    renderChat();
    await screen.findByText("Сообщений пока нет — напишите первым");
    openArticleItem();
    const dialog = screen.getByRole("dialog", { name: "Создать статью" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Заголовок статьи" }), { target: { value: "Кофе" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Текст статьи" }), { target: { value: "Текст" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Опубликовать" }));

    expect(await screen.findByText("Создание статей доступно только с Shalter Premium")).toBeTruthy();
    const again = await screen.findByRole("dialog", { name: "Создать статью" });
    expect((within(again).getByRole("textbox", { name: "Заголовок статьи" }) as HTMLInputElement).value).toBe("Кофе");
    expect((within(again).getByRole("textbox", { name: "Текст статьи" }) as HTMLTextAreaElement).value).toBe("Текст");
    await waitFor(() => expect(screen.queryByRole("article", { name: "Кофе" })).toBeNull());
  });

  it("«Изменить» у своей статьи — окно с заголовком и текстом, «Сохранить» — PATCH", async () => {
    const mine = msg("m_art", "# Было\n\nстарый текст", { type: "article", attachments: [{ kind: "image", url: "/uploads/c" }] });
    let edited: Message | null = null;
    const { calls } = fakeApi({
      ...routes,
      [HISTORY]: () => page([edited ?? mine]),
      "PATCH /api/chats/c_1/messages/m_art": (body) => {
        edited = { ...mine, text: String(body.text), editedAt: mine.createdAt };
        return { body: { message: edited } };
      },
    });
    renderChat();
    await screen.findByRole("article", { name: "Было" });
    fireEvent.contextMenu(document.querySelector('[data-message-id="m_art"]')!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));

    const dialog = screen.getByRole("dialog", { name: "Редактировать статью" });
    // Обложку при правке не меняют; текст в поле ввода не попадает.
    expect(within(dialog).queryByRole("button", { name: "Добавить обложку" })).toBeNull();
    expect((screen.getByRole("textbox", { name: "Сообщение" }) as HTMLTextAreaElement).value).toBe("");
    const title = within(dialog).getByRole("textbox", { name: "Заголовок статьи" }) as HTMLInputElement;
    expect(title.value).toBe("Было");
    expect((within(dialog).getByRole("textbox", { name: "Текст статьи" }) as HTMLTextAreaElement).value).toBe("старый текст");
    fireEvent.change(title, { target: { value: "Стало" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByRole("article", { name: "Стало" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Редактировать статью" })).toBeNull();
    expect(calls.find((c) => c.key.startsWith("PATCH"))?.body).toEqual({ text: "# Стало\n\nстарый текст" });
  });
});
