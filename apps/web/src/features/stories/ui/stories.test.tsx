import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SelfUser } from "@/entities/session";
import { closeStoryViewer } from "@/entities/story";

import { ws } from "@/shared/api";
import { fakeApi, FakeSocket, fakeSocket, FakeXhr, fakeXhr } from "@/shared/lib/test";
import { AskHost, Toaster } from "@/shared/ui";

import { StoriesBar } from "./stories-bar";
import { StoryViewerHost } from "./story-viewer-host";

const ME = { id: "u_me0000000", name: "Аня", avatarColor: "#3390ec", avatarImage: null, isDeveloper: false, adminSections: [] } as unknown as SelfUser;
const ALICE = { id: "u_alice0000", name: "Алиса Петрова", avatarColor: "#c6403b", avatarImage: null };
const at = "2026-10-26T10:00:00.000Z";
const later = "2099-10-27T10:00:00.000Z";
const story = (id: string, userId: string, patch: Record<string, unknown> = {}) => ({
  id,
  userId,
  kind: "image",
  url: `/uploads/${id}.jpg`,
  items: [{ kind: "image", url: `/uploads/${id}.jpg` }],
  createdAt: at,
  expiresAt: later,
  viewed: false,
  liked: false,
  likeCount: 0,
  viewCount: 0,
  ...patch,
});
const ALICE_STORY = "st_1700000000000_aaaaaaaa";
const MY_STORY = "st_1700000000001_bbbbbbbb";

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StoriesBar me={ME} />
        <StoryViewerHost me={ME} />
        <Toaster />
        <AskHost />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fakeSocket();
  ws.start();
  FakeSocket.last().open();
});

afterEach(() => {
  act(() => closeStoryViewer());
  cleanup();
  ws.stop();
  vi.unstubAllGlobals();
});

describe("истории", () => {
  it("чужая история: просмотр отмечается, комментарий, лайк и ответ в личку", async () => {
    const { calls } = fakeApi({
      "GET /api/stories": { body: { groups: [{ user: ALICE, stories: [story(ALICE_STORY, ALICE.id)] }] } },
      [`POST /api/stories/${ALICE_STORY}/view`]: { body: { story: story(ALICE_STORY, ALICE.id, { viewed: true }) } },
      [`GET /api/stories/${ALICE_STORY}/comments`]: { body: { comments: [] } },
      [`POST /api/stories/${ALICE_STORY}/comments`]: ({ text }) => ({
        body: { comment: { id: "stc_1700000000002_cccccccc", storyId: ALICE_STORY, userId: ME.id, text, createdAt: at, parentId: null, likedByIds: [], likeCount: 0, author: { ...ME } } },
      }),
      [`POST /api/stories/${ALICE_STORY}/like`]: { body: { story: story(ALICE_STORY, ALICE.id, { liked: true, likeCount: 1 }), liked: true, likeCount: 1 } },
      "POST /api/chats": { body: { chat: { id: "c_dm" } } },
      "POST /api/chats/c_dm/messages": { body: { message: {} } },
    });
    renderBar();
    // Своей истории нет — есть только «Выложить историю»; у других — имя без фамилии.
    expect(screen.getByRole("button", { name: /Выложить историю$/ })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Алиса$/ }));

    const viewer = await screen.findByRole("dialog", { name: "История" });
    // Поле ответа подписано подсказкой (у Playwright это и есть имя textbox).
    expect(within(viewer).getByPlaceholderText("Ответить Алиса Петрова…")).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.key === `POST /api/stories/${ALICE_STORY}/view`)).toBe(true));

    fireEvent.click(within(viewer).getByRole("button", { name: "Комментарии" }));
    expect(await within(viewer).findByText("Пока нет комментариев")).toBeTruthy();
    const box = within(viewer).getByPlaceholderText("Комментарий…");
    fireEvent.change(box, { target: { value: "Какой закат!" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await within(viewer).findByText("Какой закат!")).toBeTruthy();
    expect(within(viewer).queryByText("Пока нет комментариев")).toBeNull();

    fireEvent.click(within(viewer).getByRole("button", { name: "Нравится" }));
    expect(await within(viewer).findByRole("button", { name: "Убрать лайк" })).toBeTruthy();

    // Панель закрыли — снова поле ответа; ответ уходит в личку с плашкой истории.
    fireEvent.click(within(viewer).getByRole("button", { name: "Комментарии" }));
    const replyBox = within(viewer).getByPlaceholderText("Ответить Алиса Петрова…");
    fireEvent.change(replyBox, { target: { value: "Хочу туда же" } });
    fireEvent.keyDown(replyBox, { key: "Enter" });
    expect(await within(viewer).findByPlaceholderText("Отправлено ✓")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/chats/c_dm/messages")?.body).toEqual({
      text: "Хочу туда же",
      storyReply: { url: `/uploads/${ALICE_STORY}.jpg`, kind: "image", authorName: "Алиса Петрова" },
    });

    fireEvent.click(within(viewer).getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog", { name: "История" })).toBeNull();
  });

  it("картинка истории не загрузилась — пояснение вместо чёрного экрана", async () => {
    fakeApi({
      "GET /api/stories": { body: { groups: [{ user: ALICE, stories: [story(ALICE_STORY, ALICE.id)] }] } },
      [`POST /api/stories/${ALICE_STORY}/view`]: { body: { story: story(ALICE_STORY, ALICE.id, { viewed: true }) } },
    });
    renderBar();
    fireEvent.click(await screen.findByRole("button", { name: /Алиса$/ }));
    const viewer = await screen.findByRole("dialog", { name: "История" });
    const img = viewer.querySelector<HTMLImageElement>(`img[src="/uploads/${ALICE_STORY}.jpg"]`)!;
    expect(img.getAttribute("decoding")).toBe("async");
    fireEvent.error(img);
    expect(await within(viewer).findByText("Картинка не загрузилась — повторите позже")).toBeTruthy();
  });

  it("своя история: кто смотрел, удаление с подтверждением; удалённая по сокету пропадает из полосы", async () => {
    let feed: unknown[] = [
      { user: { ...ME }, stories: [story(MY_STORY, ME.id, { viewed: true, viewedByIds: ["u_alice0000"], likedByIds: [], viewCount: 1 })] },
      { user: ALICE, stories: [story(ALICE_STORY, ALICE.id)] },
    ];
    const { calls } = fakeApi({
      "GET /api/stories": () => ({ body: { groups: feed } }),
      [`GET /api/stories/${MY_STORY}/viewers`]: { body: { viewers: [ALICE] } },
      [`DELETE /api/stories/${MY_STORY}`]: { body: { ok: true } },
    });
    renderBar();
    await screen.findByRole("button", { name: /Алиса$/ });
    fireEvent.click(screen.getByRole("button", { name: /Моя история$/ }));
    const viewer = await screen.findByRole("dialog", { name: "История" });
    // Своей истории не лайкают и не отвечают.
    expect(within(viewer).queryByRole("button", { name: "Нравится" })).toBeNull();
    expect(within(viewer).queryByRole("textbox")).toBeNull();

    fireEvent.click(within(viewer).getByRole("button", { name: /1 просмотров/ }));
    expect(await within(viewer).findByText("Смотрели")).toBeTruthy();
    expect(within(viewer).getByRole("button", { name: /Алиса Петрова$/ })).toBeTruthy();

    fireEvent.click(within(viewer).getByRole("button", { name: "Удалить" }));
    const confirm = await screen.findByRole("dialog", { name: "Удалить историю?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(calls.some((c) => c.key === `DELETE /api/stories/${MY_STORY}`)).toBe(true));
    // Своя удалена — дальше история Алисы.
    expect(await screen.findByPlaceholderText("Ответить Алиса Петрова…")).toBeTruthy();
    act(() => closeStoryViewer());

    feed = [];
    act(() => FakeSocket.last().receive({ type: "story:deleted", storyId: ALICE_STORY, userId: ALICE.id }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Алиса$/ })).toBeNull());
  });

  it("текстовая история: белый холст с текстом, картинка уходит как фото-история", async () => {
    fakeXhr();
    // В jsdom нет canvas — подменяем рисование и toBlob.
    const ctx = new Proxy({}, { get: (_t, key) => (key === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["jpg"], { type: "image/jpeg" })));
    const { calls } = fakeApi({
      "GET /api/stories": { body: { groups: [] } },
      "POST /api/stories": { body: { story: story(MY_STORY, ME.id) } },
    });
    renderBar();
    // Своей истории нет — клик по «Выложить историю» открывает выбор создания.
    fireEvent.click(screen.getByRole("button", { name: /Выложить историю$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Текстовый пост" }));
    const editor = await screen.findByRole("dialog", { name: "Редактор истории" });
    // Фото нет — пропускать нечего; поле текста уже на холсте.
    expect(within(editor).queryByRole("button", { name: "Пропустить" })).toBeNull();
    expect(within(editor).getByText("Текст")).toBeTruthy();
    fireEvent.click(within(editor).getByRole("button", { name: "Готово" }));
    await vi.waitFor(() => expect(FakeXhr.requests.length).toBe(1));
    expect(FakeXhr.requests[0]!.params).toMatchObject({ kind: "image", name: "story.jpg", mimeType: "image/jpeg" });
    FakeXhr.requests[0]!.respond(200, { url: "/uploads/sha_text.jpg", name: "story.jpg", size: 3, mimeType: "image/jpeg" });
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/stories")?.body).toEqual({ items: [{ kind: "image", url: "/uploads/sha_text.jpg" }] }));
    vi.restoreAllMocks();
  });
});
