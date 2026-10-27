import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionQueries, useSession } from "@/entities/session";

import { ws } from "@/shared/api";
import { fakeApi, FakeSocket, fakeSocket } from "@/shared/lib/test";
import { AskHost } from "@/shared/ui";

import { useSignOut } from "./use-sign-out";

const ME = "u_test12345";

function Harness() {
  const { signOut } = useSignOut(ME);
  // Сессию в приложении читает SessionGate — без наблюдателя invalidate её не перечитает.
  useSession();
  return (
    <button type="button" onClick={() => void signOut(ME)}>
      Выйти из текущего аккаунта
    </button>
  );
}

beforeEach(() => {
  fakeSocket();
});

afterEach(() => {
  ws.stop();
  cleanup();
  vi.unstubAllGlobals();
});

describe("выход", () => {
  it("выход — сокет закрыт до запроса, сервер его 4001 уже не разбирает", async () => {
    let socketAtLogout = -1;
    const { calls } = fakeApi({
      "GET /api/auth/session": { body: { user: null, accounts: [] } },
      "POST /api/auth/logout": () => {
        socketAtLogout = FakeSocket.last().readyState;
        return { body: { ok: true, remaining: [] } };
      },
    });
    const client = new QueryClient();
    client.setQueryData(sessionQueries.current().queryKey, { user: { id: ME }, accounts: [] } as never);
    client.setQueryData(["chats", "list"], []);
    ws.start();
    const socket = FakeSocket.last();
    act(() => socket.open());

    render(
      <QueryClientProvider client={client}>
        <Harness />
        <AskHost />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Выйти из текущего аккаунта" }));
    expect(await screen.findByText("Выйти из этого аккаунта?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/auth/logout")).toBe(true));
    expect(calls.find((c) => c.key === "POST /api/auth/logout")?.body).toEqual({ uid: ME });
    expect(socketAtLogout).toBe(FakeSocket.CLOSED);
    // Сессия перечитана (никого) — SessionGate уведёт на /login; чаты прежнего аккаунта стёрты.
    await waitFor(() => expect(client.getQueryData(sessionQueries.current().queryKey)?.user).toBeNull());
    expect(client.getQueryData(["chats", "list"])).toBeUndefined();
    // Свой выход: ни переподключения, ни разбора причины через /api/sessions.
    expect(calls.some((c) => c.key === "GET /api/sessions")).toBe(false);
    expect(FakeSocket.sockets).toHaveLength(1);
  });
});
