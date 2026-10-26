import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries } from "@/entities/chat";

import { fakeApi } from "@/shared/lib/test";
import { Toaster } from "@/shared/ui";

import { ShareInboxHost } from "./share-inbox-dialog";
import { ShareRoute } from "./share-route";

const chat = (id: string, over: Record<string, unknown>) => ({ id, type: "group", title: null, archived: false, otherUser: null, ...over });

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(chatQueries.list().queryKey, [
    chat("c_dm", { type: "dm", otherUser: { id: "u_b", name: "Борис" } }),
    chat("c_fam", { title: "Семейный чат" }),
    chat("c_news", { type: "channel", title: "Новости" }),
  ] as never);
  const router = createMemoryRouter(
    [
      { path: "/share/:token", element: <ShareRoute /> },
      {
        path: "*",
        element: (
          <>
            <p>Список чатов</p>
            <ShareInboxHost />
          </>
        ),
      },
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Поделиться в Shalter»", () => {
  it("маршрут уходит к чатам, окно поверх; отправка в выбранный чат", async () => {
    const { calls } = fakeApi({
      "GET /api/share/tok1": { body: { share: { text: "Смотри, какая статья", url: "http://x.test/a", file: null } } },
      "POST /api/chats/c_fam/messages": { body: { message: { id: "m_1" } } },
    });
    const router = renderAt("/share/tok1");
    const dialog = await screen.findByRole("dialog", { name: "Поделиться в Shalter" });
    expect(router.state.location.pathname).toBe("/");
    expect(within(dialog).getByText("Смотри, какая статья")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: /Борис\s*Личный чат/ })).toBeTruthy();
    expect(within(dialog).queryByText("Новости")).toBeNull();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Поиск чата" }), { target: { value: "сем" } });
    expect(within(dialog).queryByText("Борис")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /Семейный чат\s*Группа/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_fam"));
    expect(await screen.findByText("Отправлено в «Семейный чат»")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/chats/c_fam/messages")?.body).toEqual({ text: "Смотри, какая статья" });
  });

  it("устаревшая ссылка — подсказка без окна", async () => {
    fakeApi({ "GET /api/share/tok2": { status: 404, body: { error: "Ссылка устарела — поделитесь ещё раз" } } });
    renderAt("/share/tok2");
    expect(await screen.findByText("Ссылка устарела — поделитесь ещё раз")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
