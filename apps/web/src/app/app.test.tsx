import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ws } from "@/shared/api";
import { writeCache } from "@/shared/lib/local-cache";
import { fakeApi, FakeSocket,fakeSocket } from "@/shared/lib/test";

import { App } from "./app";

const ME = { id: "u_test12345", name: "Аня" };

const group = {
  id: "c_group0001",
  type: "group",
  title: "Семья",
  memberIds: ["u_test12345"],
  adminIds: [],
  moderatorIds: [],
  ownerIds: [],
  archived: false,
  pinned: false,
  pinOrder: null,
  muted: false,
  mutedUntil: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  lastMessage: null,
  unreadCount: 0,
  hasUnreadMention: false,
  otherUser: null,
  draft: null,
};

const bootstrap = { body: { settings: {}, chats: [group], folders: [], contactIds: [] } };

beforeEach(() => {
  fakeSocket();
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(380);
});

afterEach(() => {
  // Список чатов прошлого запуска (shared/lib/local-cache) не должен перейти в следующий тест.
  localStorage.clear();
  ws.stop();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("вход и оболочка", () => {
  it("без сессии — экран входа, сокет не открывается", async () => {
    fakeApi({ "GET /api/auth/session": { body: { user: null, accounts: [] } } });
    window.history.replaceState(null, "", "/chat/c_abc");
    render(<App />);
    expect(await screen.findByText("Рады видеть вас снова")).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
    expect(FakeSocket.sockets).toHaveLength(0);
  });

  it("с сессией — оболочка; /login уводит в приложение", async () => {
    fakeApi({ "GET /api/auth/session": { body: { user: ME, accounts: [] } }, "GET /api/bootstrap": bootstrap });
    window.history.replaceState(null, "", "/login");
    render(<App />);
    expect(await screen.findByText("Выберите чат")).toBeTruthy();
    expect(screen.getByRole("navigation").querySelector("[title='Аккаунты']")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Чаты" })).toBeTruthy();
    expect(window.location.pathname).toBe("/");
  });

  it("/login?reason=revoked (сюда ведёт сокет, закрытый сервером) — с пояснением", async () => {
    fakeApi({ "GET /api/auth/session": { body: { user: null, accounts: [] } } });
    window.history.replaceState(null, "", "/login?reason=revoked");
    render(<App />);
    expect(await screen.findByText("Сеанс на этом устройстве был завершён — войдите снова.")).toBeTruthy();
  });
});

describe("сеанс прошлого запуска", () => {
  const remember = () => writeCache("session", "last", { user: ME, accounts: [] });

  it("оболочка — сразу, не дожидаясь /api/auth/session", async () => {
    remember();
    fakeApi({ "GET /api/bootstrap": bootstrap });
    const answered = fetch;
    // Сервер о сеансе молчит — приложение всё равно открыто под прошлым.
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === "/api/auth/session" ? new Promise(() => {}) : answered(input, init)
    );
    render(<App />);
    expect(await screen.findByText("Выберите чат")).toBeTruthy();
  });

  it("сервер ответил, что входа нет, — экран входа", async () => {
    remember();
    fakeApi({ "GET /api/auth/session": { body: { user: null, accounts: [] } }, "GET /api/bootstrap": { status: 401, body: { error: "unauthorized" } } });
    render(<App />);
    expect(await screen.findByText("Рады видеть вас снова")).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
  });
});

describe("список чатов в оболочке", () => {
  it("чаты из /api/bootstrap — без отдельного /api/chats; сокет открыт; чат открывается по ссылке", async () => {
    const { calls } = fakeApi({ "GET /api/auth/session": { body: { user: ME, accounts: [] } }, "GET /api/bootstrap": bootstrap });
    render(<App />);
    const row = await screen.findByRole("button", { name: /Семья/ });
    // Кроме входа и bootstrap — только сверка входящих звонков, версия приложения, полоса историй и сообщества.
    const side = new Set(["GET /api/calls", "GET /api/version", "GET /api/stories", "GET /api/communities/joined"]);
    expect(calls.map((c) => c.key).filter((k) => !side.has(k))).toEqual(["GET /api/auth/session", "GET /api/bootstrap"]);
    expect(FakeSocket.last().url).toBe(`ws://${window.location.host}/ws`);

    fireEvent.click(row);
    expect(await screen.findByRole("heading", { name: "Семья" })).toBeTruthy();
    expect(window.location.pathname).toBe("/chat/c_group0001");
    expect(row.getAttribute("aria-current")).toBe("page");
  });

  it("неизвестный чат — «Чат не найден»", async () => {
    fakeApi({ "GET /api/auth/session": { body: { user: ME, accounts: [] } }, "GET /api/bootstrap": bootstrap });
    window.history.replaceState(null, "", "/chat/c_nope");
    render(<App />);
    expect(await screen.findByText("Чат не найден")).toBeTruthy();
  });

});
