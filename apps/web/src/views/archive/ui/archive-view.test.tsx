import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries } from "@/entities/chat";
import { sessionQueries } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";

import { ArchiveView } from "./archive-view";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[] };
const chat = (id: string, name: string, archived: boolean) => ({
  id,
  type: "dm",
  title: null,
  memberIds: [ME.id, `u_${id}`],
  adminIds: [],
  otherUser: { id: `u_${id}`, name, avatarColor: "#3390ec" },
  archived,
  pinned: false,
  unreadCount: 0,
  mutedUntil: null,
  pinOrder: null,
  lastMessage: { id: `m_${id}`, chatId: id, senderId: `u_${id}`, type: "text", text: `Привет от ${name}`, createdAt: "2026-10-20T10:00:00.000Z" },
  createdAt: "2026-10-01T10:00:00.000Z",
});

function renderArchive(chats: unknown[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: ME } as never);
  client.setQueryData(chatQueries.list().queryKey, chats as never);
  const router = createMemoryRouter(
    [
      { path: "/archive", element: <ArchiveView /> },
      { path: "/chat/:chatId", element: <p>чат</p> },
    ],
    { initialEntries: ["/archive"] }
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

describe("«Архив»", () => {
  it("только заархивированные, с подсказкой; строка открывает чат, меню — «Вернуть из архива»", async () => {
    const { calls } = fakeApi({ "PATCH /api/chats/c_b": { body: {} }, "GET /api/chats": { body: { chats: [] } } });
    const router = renderArchive([chat("c_b", "Борис", true), chat("c_v", "Вера", false)]);
    expect(screen.getByText("В архиве — 1")).toBeTruthy();
    expect(screen.getByText(/Чаты с включёнными уведомлениями возвращаются из архива/)).toBeTruthy();
    expect(screen.queryByText("Вера")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Действия с чатом" }));
    fireEvent.click(await screen.findByRole("button", { name: "Вернуть из архива" }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /api/chats/c_b")?.body).toEqual({ archived: false }));
    expect(await screen.findByText(/^В архиве пусто/)).toBeTruthy();
    expect(router.state.location.pathname).toBe("/archive");
  });
});
