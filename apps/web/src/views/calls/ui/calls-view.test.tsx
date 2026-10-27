import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCall, hangup } from "@/features/call";

import { sessionQueries } from "@/entities/session";

import { fakeApi, fakeRtc } from "@/shared/lib/test";

import { CallsView } from "./calls-view";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[] };
const LENA = { id: "u_lena00000", name: "Лена", username: "lena", online: true };
const OLEG = { id: "u_oleg00000", name: "Олег", username: null, online: false };
const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const row = (patch: Record<string, unknown>) => ({ chatId: "c_lena", kind: "audio", callerId: LENA.id, status: "completed", durationSec: 0, participantIds: [ME.id, LENA.id], otherUser: LENA, group: null, ...patch });

function renderCalls() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: ME } as never);
  const router = createMemoryRouter(
    [
      { path: "/calls", element: <CallsView /> },
      { path: "/chat/:chatId", element: <p>чат</p> },
      { path: "/call/:callId", element: <p>Экран звонка</p> },
    ],
    { initialEntries: ["/calls"] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

afterEach(async () => {
  if (getCall()) await hangup();
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Звонки»", () => {
  it("контакты и недавние: исход звонка, «Пропущенные» с числом; аватар открывает чат", async () => {
    fakeApi({
      "GET /api/calls": {
        body: {
          calls: [
            row({ id: "cl_1", direction: "incoming", status: "missed", startedAt: at(5) }),
            row({ id: "cl_2", direction: "outgoing", callerId: ME.id, status: "completed", durationSec: 65, kind: "video", startedAt: at(90) }),
            row({ id: "cl_3", direction: "outgoing", callerId: ME.id, status: "declined", startedAt: at(120) }),
          ],
        },
      },
      "GET /api/contacts": { body: { contacts: [{ user: LENA }, { user: OLEG }] } },
    });
    const router = renderCalls();
    expect(await screen.findByText("Контакты — 2")).toBeTruthy();
    expect(screen.getByText("в сети")).toBeTruthy();
    expect(screen.getByText("не в сети")).toBeTruthy();
    expect(await screen.findByText(/Входящий · пропущен · 5 минут назад/)).toBeTruthy();
    expect(screen.getByText(/Исходящий · 1:05 · час назад/)).toBeTruthy();
    expect(screen.getByText(/Исходящий · отклонён/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Пропущенные 1" }));
    expect(screen.queryByText(/Исходящий/)).toBeNull();
    expect(screen.getByText(/пропущен/)).toBeTruthy();

    fireEvent.click(screen.getAllByTitle("Открыть чат")[0]!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_lena"));
  });

  it("пусто — «Звонков ещё не было» и подсказка про контакты", async () => {
    fakeApi({ "GET /api/calls": { body: { calls: [] } }, "GET /api/contacts": { body: { contacts: [] } } });
    renderCalls();
    expect(await screen.findByText("Звонков ещё не было")).toBeTruthy();
    expect(screen.getByText("Добавьте человека в контакты — и сможете позвонить ему отсюда в одно нажатие.")).toBeTruthy();
  });

  it("«Позвонить» → «Кому позвонить»: личка с человеком и звонок в неё", async () => {
    fakeRtc();
    const placed = { id: "cl_9", chatId: "c_oleg", kind: "audio", callerId: ME.id, status: "ongoing", startedAt: at(0), durationSec: 0, participantIds: [ME.id, OLEG.id] };
    const { calls } = fakeApi({
      "GET /api/calls": { body: { calls: [] } },
      "GET /api/contacts": { body: { contacts: [{ user: OLEG }] } },
      "POST /api/chats": { body: { chat: { id: "c_oleg", type: "dm" } } },
      "POST /api/calls": { body: { call: placed } },
      "GET /api/chats/c_oleg": { body: { chat: { id: "c_oleg", type: "dm", title: null }, members: [ME, OLEG] } },
      "PATCH /api/calls/cl_9": { body: {} },
    });
    const router = renderCalls();
    // Не путать с кнопками «Позвонить» в строках контактов (у них только подсказка).
    await screen.findByText("Олег");
    fireEvent.click(screen.getByText("Позвонить", { selector: "button" }));
    const dialog = await screen.findByRole("dialog", { name: "Кому позвонить" });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Олег/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/call/cl_9"));
    expect(calls.find((c) => c.key === "POST /api/chats")?.body).toMatchObject({ userId: OLEG.id, title: "Олег" });
    expect(calls.find((c) => c.key === "POST /api/calls")?.body).toEqual({ chatId: "c_oleg", kind: "audio", ringAll: false });
  });
});
