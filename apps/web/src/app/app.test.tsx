import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ws } from "@/shared/api";
import { fakeApi, FakeSocket,fakeSocket } from "@/shared/lib/test";

import { App } from "./app";

const ME = { id: "u_test12345", name: "Аня" };

const group = {
  id: "c_group0001",
  type: "group",
  title: "Семья",
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
    expect(await screen.findByText("Вход в Shalter")).toBeTruthy();
    expect(window.location.pathname).toBe("/login");
    expect(FakeSocket.sockets).toHaveLength(0);
  });

  it("с сессией — оболочка; /login уводит в приложение", async () => {
    fakeApi({ "GET /api/auth/session": { body: { user: ME, accounts: [] } }, "GET /api/bootstrap": bootstrap });
    window.history.replaceState(null, "", "/login");
    render(<App />);
    expect(await screen.findByText("Выберите чат")).toBeTruthy();
    expect(screen.getByTitle("Аня")).toBeTruthy();
    expect(window.location.pathname).toBe("/");
  });

  it("/login?reason=revoked (сюда ведёт сокет, закрытый сервером) — с пояснением", async () => {
    fakeApi({ "GET /api/auth/session": { body: { user: null, accounts: [] } } });
    window.history.replaceState(null, "", "/login?reason=revoked");
    render(<App />);
    expect(await screen.findByText("Сеанс на этом устройстве был завершён — войдите снова.")).toBeTruthy();
  });
});

describe("список чатов в оболочке", () => {
  it("чаты из /api/bootstrap — без отдельного /api/chats; сокет открыт; чат открывается по ссылке", async () => {
    const { calls } = fakeApi({ "GET /api/auth/session": { body: { user: ME, accounts: [] } }, "GET /api/bootstrap": bootstrap });
    render(<App />);
    const row = await screen.findByRole("link", { name: /Семья/ });
    expect(calls.map((c) => c.key)).toEqual(["GET /api/auth/session", "GET /api/bootstrap"]);
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

  it("выход — сокет закрыт до запроса, сервер его 4001 уже не разбирает", async () => {
    let session = { user: ME as typeof ME | null, accounts: [] };
    const { calls } = fakeApi({
      "GET /api/auth/session": () => ({ body: session }),
      "GET /api/bootstrap": bootstrap,
      "POST /api/auth/logout": () => {
        session = { user: null, accounts: [] };
        return { body: { ok: true, remaining: [] } };
      },
    });
    render(<App />);
    await screen.findByRole("link", { name: /Семья/ });
    const socket = FakeSocket.last();
    act(() => socket.open());
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
    expect(await screen.findByText("Вход в Shalter")).toBeTruthy();
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/auth/logout")).toBe(true));
    expect(calls.some((c) => c.key === "GET /api/sessions")).toBe(false);
    expect(FakeSocket.sockets).toHaveLength(1);
  });
});
