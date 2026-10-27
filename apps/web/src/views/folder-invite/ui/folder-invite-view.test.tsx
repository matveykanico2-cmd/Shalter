import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { FolderInviteView } from "./folder-invite-view";

const CODE = "0123456789abcdef";

function renderAt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/folder/:code", element: <FolderInviteView /> },
      { path: "/", element: <p>Список чатов</p> },
    ],
    { initialEntries: [`/folder/${CODE}`] }
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

describe("папка по ссылке", () => {
  it("публичные чаты папки, «Добавить папку себе», «Готово — открыть чаты»", async () => {
    const { calls } = fakeApi({
      [`GET /api/folders/invite/${CODE}`]: { body: { name: "Хобби", chats: [{ id: "c_chess", type: "group", title: "Шахматный клуб" }] } },
      [`POST /api/folders/invite/${CODE}/import`]: { body: { folder: { id: "f_1" } } },
    });
    const router = renderAt();
    expect(await screen.findByRole("heading", { name: "Папка «Хобби»" })).toBeTruthy();
    expect(screen.getByText("Шахматный клуб")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Добавить папку себе" }));
    fireEvent.click(await screen.findByRole("button", { name: "Готово — открыть чаты" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(calls.some((c) => c.key === `POST /api/folders/invite/${CODE}/import`)).toBe(true);
  });

  it("отозванная ссылка — «Ссылка не работает»", async () => {
    fakeApi({ [`GET /api/folders/invite/${CODE}`]: { status: 404, body: { error: "Ссылка недействительна или отозвана" } } });
    renderAt();
    expect(await screen.findByRole("heading", { name: "Ссылка не работает" })).toBeTruthy();
    expect(screen.getByText("Ссылка недействительна или отозвана")).toBeTruthy();
  });
});
