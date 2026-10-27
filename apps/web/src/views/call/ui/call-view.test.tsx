import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/widgets/app-shell";

import { getCall } from "@/features/call";

import { type SelfUser, sessionQueries } from "@/entities/session";

import { ws } from "@/shared/api";
import { fakeApi, FakePeer, fakeRtc, FakeSocket, fakeSocket } from "@/shared/lib/test";
import { AskHost, Toaster } from "@/shared/ui";

import { CallJoinView } from "./call-join-view";
import { CallView } from "./call-view";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[] } as unknown as SelfUser;
const BORIS = { id: "u_boris0000", name: "Борис", username: "boris" };
const CALL = { id: "cl_1", chatId: "c_1", kind: "audio", callerId: BORIS.id, status: "ongoing", startedAt: new Date().toISOString(), durationSec: 0, participantIds: [BORIS.id, ME.id] };
const listed = (call = CALL) => ({ body: { calls: [{ ...call, direction: "incoming", otherUser: BORIS, group: null }] } });

function renderApp(path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionQueries.current().queryKey, { user: ME } as never);
  const router = createMemoryRouter(
    [
      {
        element: <AppShell user={ME} sidebar={null} main={<Outlet />} mainOpen />,
        children: [
          { path: "/", element: <p>Список чатов</p> },
          { path: "/chat/:chatId", element: <Link to="/">чат</Link> },
          { path: "/call/:callId", element: <CallView /> },
          { path: "/call-join/:token", element: <CallJoinView /> },
        ],
      },
    ],
    { initialEntries: [path] }
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toaster />
      <AskHost />
    </QueryClientProvider>
  );
  return router;
}

beforeEach(() => {
  fakeSocket();
  fakeRtc();
  ws.start();
  FakeSocket.last().open();
});

afterEach(async () => {
  cleanup();
  ws.stop();
  vi.unstubAllGlobals();
  // Звонок живёт вне экранов — между тестами его не остаётся.
  await vi.waitFor(() => expect(getCall()).toBeNull());
});

describe("звонки в оболочке", () => {
  it("входящий: экран вызова, «Ответить» — экран звонка; ушли в чат — пузырь; пузырь — обратно; «Завершить» — в чат", async () => {
    const { calls } = fakeApi({
      "GET /api/calls": { body: { calls: [] } },
      "GET /api/chats/c_1": { body: { chat: { id: "c_1", type: "dm", title: null }, members: [ME, BORIS] } },
      "POST /api/calls/cl_1/answer": { body: { ok: true } },
      "POST /api/calls/cl_1/leave": { body: { ok: true } },
      "PATCH /api/calls/cl_1": { body: { call: { ...CALL, status: "completed" } } },
    });
    const router = renderApp();
    await waitFor(() => expect(calls.some((c) => c.key === "GET /api/calls")).toBe(true));
    act(() => FakeSocket.last().receive({ type: "call:incoming", call: { ...CALL, otherUser: BORIS } }));
    expect(await screen.findByText("Входящий звонок")).toBeTruthy();
    expect(screen.getByText("@boris")).toBeTruthy();

    // Звонок уже в истории — после ответа его найдёт joinCallById.
    fakeApi({
      "GET /api/calls": listed(),
      "GET /api/chats/c_1": { body: { chat: { id: "c_1", type: "dm", title: null }, members: [ME, BORIS] } },
      "POST /api/calls/cl_1/answer": { body: { ok: true } },
      "PATCH /api/calls/cl_1": { body: { call: { ...CALL, status: "completed" } } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ответить" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/call/cl_1"));
    expect(screen.queryByText("Входящий звонок")).toBeNull();
    expect(await screen.findByTitle("Завершить")).toBeTruthy();
    // Название звонка — имя собеседника (у лички нет своего).
    expect(screen.getAllByText("Борис").length).toBe(2);
    expect(screen.getByText("Вызов…")).toBeTruthy();

    // Соединились — пошёл таймер.
    await waitFor(() => expect(FakePeer.instances).toHaveLength(0));
    act(() => FakeSocket.last().receive({ type: "call:signal", signal: { id: "sig_1_1", seq: 1, callId: "cl_1", fromUserId: BORIS.id, toUserId: ME.id, kind: "offer", data: { type: "offer", sdp: "v=0" }, createdAt: CALL.startedAt } }));
    await waitFor(() => expect(FakePeer.instances).toHaveLength(1));
    act(() => FakePeer.instances[0]!.connect());
    expect(await screen.findByText("00:00")).toBeTruthy();

    // «Микрофон» выключает звук.
    fireEvent.click(screen.getByTitle("Микрофон"));
    expect(screen.getByTitle("Микрофон").getAttribute("aria-pressed")).toBe("true");

    // «Жесты» — по умолчанию выключены, выбор запоминается; без камеры распознавание не грузится.
    const gestures = screen.getByRole("button", { name: "Жесты" });
    expect(gestures.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(gestures);
    expect(gestures.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("shalter.callGestures")).toBe("1");
    expect(document.querySelector('script[src*="mediapipe"]')).toBeNull();
    fireEvent.click(gestures);
    expect(localStorage.getItem("shalter.callGestures")).toBe("0");

    // Свернуть — в чат звонка; звонок идёт, в углу пузырь с собеседником и таймером.
    fireEvent.click(screen.getByTitle("Свернуть (PiP)"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_1"));
    const bubble = await screen.findByRole("button", { name: /Борис\s*\d{2}:\d{2}/ });
    // Ушли и из чата — пузырь остаётся.
    fireEvent.click(screen.getByRole("link", { name: "чат" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.getByRole("button", { name: /Борис\s*\d{2}:\d{2}/ })).toBe(bubble);

    fireEvent.click(bubble);
    await waitFor(() => expect(router.state.location.pathname).toBe("/call/cl_1"));
    expect(screen.queryByRole("button", { name: /Борис\s*\d{2}:\d{2}/ })).toBeNull();

    fireEvent.click(screen.getByTitle("Завершить"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_1"));
    expect(getCall()).toBeNull();
  });

  it("«Отклонить» — звонок отклонён, экран вызова закрыт", async () => {
    // Показанный однажды звонок второй раз не звонит — у каждого теста свой id.
    const { calls } = fakeApi({ "GET /api/calls": { body: { calls: [] } }, "PATCH /api/calls/cl_4": { body: { call: { ...CALL, id: "cl_4", status: "declined" } } } });
    renderApp();
    await screen.findByText("Список чатов");
    act(() => FakeSocket.last().receive({ type: "call:incoming", call: { ...CALL, id: "cl_4", otherUser: BORIS } }));
    fireEvent.click(await screen.findByRole("button", { name: "Отклонить" }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /api/calls/cl_4")?.body).toEqual({ status: "declined" }));
    expect(screen.queryByText("Входящий звонок")).toBeNull();
  });

  it("звонящий сбросил (call:updated) — экран вызова закрывается", async () => {
    fakeApi({ "GET /api/calls": { body: { calls: [] } } });
    renderApp();
    await screen.findByText("Список чатов");
    act(() => FakeSocket.last().receive({ type: "call:incoming", call: { ...CALL, id: "cl_2", otherUser: BORIS } }));
    expect(await screen.findByText("Входящий звонок")).toBeTruthy();
    // Чужой звонок экран не трогает.
    act(() => FakeSocket.last().receive({ type: "call:updated", call: { ...CALL, id: "cl_other", status: "ended" } }));
    expect(screen.getByText("Входящий звонок")).toBeTruthy();
    act(() => FakeSocket.last().receive({ type: "call:updated", call: { ...CALL, id: "cl_2", status: "ended" } }));
    await waitFor(() => expect(screen.queryByText("Входящий звонок")).toBeNull());
  });

  it("групповой видеозвонок подписан «Групповой видеозвонок»", async () => {
    fakeApi({ "GET /api/calls": { body: { calls: [] } } });
    renderApp();
    await screen.findByText("Список чатов");
    act(() => FakeSocket.last().receive({ type: "call:incoming", call: { ...CALL, id: "cl_3", kind: "video", participantIds: [BORIS.id, ME.id, "u_third0000"], otherUser: BORIS } }));
    expect(await screen.findByText("Групповой видеозвонок")).toBeTruthy();
  });

  it("звонка нет — «Звонок не найден или уже завершён.»", async () => {
    fakeApi({ "GET /api/calls": { body: { calls: [] } } });
    renderApp("/call/cl_gone");
    expect(await screen.findByText("Звонок не найден или уже завершён.")).toBeTruthy();
  });

  it("ссылка-приглашение: вход в звонок и его экран; устаревшая — «Ссылка недействительна»", async () => {
    const own = { ...CALL, callerId: BORIS.id };
    const { calls } = fakeApi({
      "POST /api/calls/join/tok_ok": { body: { call: own } },
      "GET /api/calls": listed(own),
      "GET /api/chats/c_1": { body: { chat: { id: "c_1", type: "dm", title: null }, members: [ME, BORIS] } },
      "POST /api/calls/cl_1/answer": { body: { ok: true } },
      "PATCH /api/calls/cl_1": { body: { call: own } },
    });
    const router = renderApp("/call-join/tok_ok");
    await waitFor(() => expect(router.state.location.pathname).toBe("/call/cl_1"));
    expect(await screen.findByTitle("Завершить")).toBeTruthy();
    expect(calls.filter((c) => c.key === "POST /api/calls/join/tok_ok")).toHaveLength(1);
    fireEvent.click(screen.getByTitle("Завершить"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/chat/c_1"));

    fakeApi({ "POST /api/calls/join/tok_bad": { status: 404, body: { error: "Ссылка недействительна или звонок уже завершён" } }, "GET /api/calls": { body: { calls: [] } } });
    await act(() => router.navigate("/call-join/tok_bad"));
    expect(await screen.findByText("Ссылка недействительна")).toBeTruthy();
    expect(screen.getByText("Ссылка недействительна или звонок уже завершён")).toBeTruthy();
  });
});
