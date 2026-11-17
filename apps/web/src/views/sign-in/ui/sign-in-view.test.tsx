import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { sessionQueries } from "@/entities/session";

import { SignInView } from "./sign-in-view";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, {
    user: { id: "u_existing", name: "Аня" },
    accounts: [{ id: "u_existing", name: "Аня" }],
  });
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>Чаты</p> },
      { path: "/login", element: <SignInView /> },
    ],
    { initialEntries: ["/login?add=1"] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

afterEach(cleanup);

describe("добавление аккаунта", () => {
  it("возвращается в приложение без полной перезагрузки native WebView", () => {
    const router = setup();

    fireEvent.click(screen.getByRole("button", { name: /Отмена/ }));

    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toBe("");
  });
});
