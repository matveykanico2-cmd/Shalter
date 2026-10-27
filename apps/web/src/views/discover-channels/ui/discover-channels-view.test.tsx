import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries } from "@/entities/chat";

import { fakeApi } from "@/shared/lib/test";
import { AskHost } from "@/shared/ui";

import { DiscoverChannelsView } from "./discover-channels-view";

const channel = (over: Record<string, unknown> = {}) => ({ id: "c_food", title: "Рецепты", username: "food", subscriberCount: 1, isMember: false, ...over });

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(chatQueries.list().queryKey, []);
  const router = createMemoryRouter(
    [
      { path: "/discover-channels", element: <DiscoverChannelsView /> },
      { path: "/chat/:chatId", element: <p>чат</p> },
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <AskHost />
    </QueryClientProvider>
  );
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("каталог каналов", () => {
  it("поиск, подписка открывает канал", async () => {
    const { calls } = fakeApi({
      "GET /api/ads/serve?placement=discover": { body: { ad: null } },
      "GET /api/channels?q=": { body: { channels: [channel()] } },
      "GET /api/channels?q=nothing": { body: { channels: [] } },
      "POST /api/channels/c_food/subscribe": { body: { ok: true } },
      "GET /api/chats": { body: { chats: [] } },
    });
    const router = renderAt("/discover-channels");
    expect(await screen.findByText("@food · 1 подписчик")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Поиск по названию или @юзернейму"), { target: { value: "nothing" } });
    expect(await screen.findByText("Ничего не найдено")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Поиск по названию или @юзернейму"), { target: { value: "" } });
    fireEvent.click(await screen.findByRole("button", { name: "Подписаться" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_food"));
    expect(calls.some((c) => c.key === "POST /api/channels/c_food/subscribe")).toBe(true);
  });

  it("отписка с подтверждением", async () => {
    let member = true;
    fakeApi({
      "GET /api/ads/serve?placement=discover": { body: { ad: null } },
      [`GET /api/channels?q=${encodeURIComponent("Рецепты")}`]: () => ({ body: { channels: [channel({ isMember: member, subscriberCount: member ? 2 : 1 })] } }),
      "POST /api/chats/c_food/leave": () => {
        member = false;
        return { body: { ok: true } };
      },
      "GET /api/chats": { body: { chats: [] } },
    });
    renderAt(`/discover-channels?q=${encodeURIComponent("Рецепты")}`);
    fireEvent.click(await screen.findByRole("button", { name: "Отписаться" }));
    expect(await screen.findByRole("heading", { name: "Отписаться от «Рецепты»?" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Отписаться" }).at(-1)!);
    expect(await screen.findByRole("button", { name: "Подписаться" })).toBeTruthy();
    expect(screen.getByText("@food · 1 подписчик")).toBeTruthy();
  });
});
