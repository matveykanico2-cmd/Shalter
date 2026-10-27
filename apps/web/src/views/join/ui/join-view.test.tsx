import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries } from "@/entities/chat";

import { fakeApi } from "@/shared/lib/test";

import { JoinView } from "./join-view";

const CODE = "AbCdEfGhIjKlMnOpQrStUv";
const info = { id: "c_club", type: "group", title: "Клуб", description: "Про книги", isVerified: true, memberCount: 12, alreadyMember: false, banned: false, approveJoins: false, requestPending: false };

function renderAt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(chatQueries.list().queryKey, []);
  const router = createMemoryRouter(
    [
      { path: "/join/:code", element: <JoinView /> },
      { path: "/chat/:chatId", element: <p>чат</p> },
      { path: "/", element: <p>Список чатов</p> },
    ],
    { initialEntries: [`/join/${CODE}`] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("пригласительная ссылка", () => {
  it("чат по ссылке — «Присоединиться к группе», затем сам чат", async () => {
    fakeApi({
      [`GET /api/chats/invite/${CODE}`]: { body: { chat: info } },
      [`POST /api/chats/invite/${CODE}/join`]: { body: { chat: { id: "c_club" } } },
      "GET /api/chats": { body: { chats: [] } },
    });
    const router = renderAt();
    expect(await screen.findByText("Про книги")).toBeTruthy();
    expect(screen.getByText("12 участников")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Присоединиться к группе" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_club"));
  });

  it("по заявке — «Подать заявку» и «Заявка отправлена»; отозванная ссылка — «Ссылка не работает»", async () => {
    fakeApi({
      [`GET /api/chats/invite/${CODE}`]: { body: { chat: { ...info, approveJoins: true } } },
      [`POST /api/chats/invite/${CODE}/join`]: { body: { pending: true, chat: { id: "c_club", title: "Клуб", type: "group" } } },
    });
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Подать заявку" }));
    expect(await screen.findByText("Заявка отправлена — администратор её рассмотрит, и чат появится в списке.")).toBeTruthy();
    cleanup();

    fakeApi({ [`GET /api/chats/invite/${CODE}`]: { status: 404, body: { error: "Ссылка недействительна или отозвана" } } });
    renderAt();
    expect(await screen.findByText("Ссылка не работает")).toBeTruthy();
    expect(screen.getByText("Ссылка недействительна или отозвана")).toBeTruthy();
  });
});
