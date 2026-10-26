import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { PartnersSection } from "./partners-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Партнёрка»", () => {
  it("условия и «Написать администратору» — переход в чат", async () => {
    fakeApi({ "GET /api/partners/me": { body: { tariffText: "10% с оплат" } }, "POST /api/partners/chat": { body: { chatId: "c_admin" } } });
    const router = createMemoryRouter([{ path: "/", element: <PartnersSection /> }, { path: "/chat/:id", element: <p>чат</p> }]);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
    expect(await screen.findByText("10% с оплат")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Написать администратору" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_admin"));
  });
});
