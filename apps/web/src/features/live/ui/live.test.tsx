import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SelfUser } from "@/entities/session";

import { ws } from "@/shared/api";
import { fakeApi, fakeRtc, FakeSocket, fakeSocket } from "@/shared/lib/test";
import { AskHost, Toaster } from "@/shared/ui";

import { closeLive, leaveLive } from "../model/live-store";
import { useStartLiveItem } from "../model/use-start-live-item";

import { LiveBar } from "./live-bar";
import { LiveHost } from "./live-host";

const ME = { id: "u_me0000000", name: "Аня", blockedUserIds: [] as string[] } as unknown as SelfUser;
const HOST = "u_host00000";
const ID = "live_1700000000000_abc";
const CHAT = { id: "c_1", type: "group", title: "Клуб" };
const at = "2026-10-26T10:00:00.000Z";
const stream = (patch: Record<string, unknown> = {}) => ({ id: ID, chatId: "c_1", hostId: HOST, title: "Разбор", withVideo: true, source: "webrtc", rtmpLive: false, status: "live", startedAt: at, endedAt: null, ...patch });
const person = (userId: string, role: string, name: string) => ({ userId, role, handRaised: false, mutedByHost: false, joinedAt: at, user: { id: userId, name } });

function StartLive() {
  const item = useStartLiveItem({ chat: CHAT, meId: ME.id });
  return item ? (
    <button type="button" onClick={item.onClick}>
      {item.label}
    </button>
  ) : null;
}

function renderLive() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StartLive />
      <LiveBar chat={CHAT} meId={ME.id} />
      <LiveHost me={ME} />
      <Toaster />
      <AskHost />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fakeSocket();
  fakeRtc();
  ws.start();
  FakeSocket.last().open();
});

afterEach(async () => {
  await leaveLive();
  act(() => closeLive());
  cleanup();
  ws.stop();
  vi.unstubAllGlobals();
});

describe("эфиры", () => {
  it("плашка «Идёт эфир» — «Смотреть»: экран эфира, чат, «Попросить слово», «Выйти»", async () => {
    const { calls } = fakeApi({
      "GET /api/live/chat/c_1": { body: { stream: stream(), viewers: 2, canHost: true, canStop: false } },
      [`POST /api/live/${ID}/join`]: { body: { stream: stream(), participants: [person(HOST, "host", "Лена"), person(ME.id, "viewer", "Аня")], messages: [], ingest: null } },
      [`POST /api/live/${ID}/messages`]: { body: { message: { id: "lm_1700000000001_abc", text: "привет", createdAt: at, user: { id: ME.id, name: "Аня" } } } },
      [`POST /api/live/${ID}/hand`]: { body: { ok: true } },
      [`POST /api/live/${ID}/leave`]: { body: { ok: true } },
    });
    renderLive();
    expect(await screen.findByText("Разбор")).toBeTruthy();
    expect(screen.getByText("2 в эфире")).toBeTruthy();
    // Эфир идёт — начать второй нельзя; «Завершить» — только тому, кто может.
    expect(screen.queryByRole("button", { name: "Начать эфир" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Завершить" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Смотреть" }));
    const live = await screen.findByRole("dialog", { name: "Эфир" });
    expect(await within(live).findByText("Участники — 2")).toBeTruthy();
    expect(within(live).getByText("В ЭФИРЕ")).toBeTruthy();
    expect(within(live).getByText("ведущий")).toBeTruthy();
    expect(within(live).getByText("смотрит")).toBeTruthy();
    expect(within(live).getByText("Ведущий ещё не включил камеру")).toBeTruthy();
    expect(within(live).getByText("Пока никто ничего не написал")).toBeTruthy();
    // Зрителю — ни микрофона, ни «Завершить эфир».
    expect(within(live).queryByTitle("Микрофон")).toBeNull();
    expect(within(live).queryByText("Завершить эфир")).toBeNull();

    const input = within(live).getByPlaceholderText("Сообщение в эфир");
    fireEvent.change(input, { target: { value: "привет" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(calls.find((c) => c.key === `POST /api/live/${ID}/messages`)?.body).toEqual({ text: "привет" }));
    act(() => FakeSocket.last().receive({ type: "live:message", streamId: ID, message: { id: "lm_1700000000002_abc", text: "здравствуйте", createdAt: at, user: { id: HOST, name: "Лена" } } }));
    expect(await within(live).findByText("здравствуйте")).toBeTruthy();
    expect(within(live).getByText("Лена:", { exact: false, selector: "span" })).toBeTruthy();

    fireEvent.click(within(live).getByRole("button", { name: /Попросить слово/ }));
    await waitFor(() => expect(calls.find((c) => c.key === `POST /api/live/${ID}/hand`)?.body).toEqual({ raised: true }));

    fireEvent.click(within(live).getByRole("button", { name: /Выйти/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Эфир" })).toBeNull());
    expect(calls.some((c) => c.key === `POST /api/live/${ID}/leave`)).toBe(true);
  });

  it("«Завершить» на плашке — с подтверждением", async () => {
    const { calls } = fakeApi({
      "GET /api/live/chat/c_1": { body: { stream: stream(), viewers: 1, canHost: true, canStop: true } },
      [`POST /api/live/${ID}/stop`]: { body: { stream: stream({ status: "ended", endedAt: at }) } },
    });
    renderLive();
    fireEvent.click(await screen.findByRole("button", { name: "Завершить" }));
    const dialog = await screen.findByRole("dialog", { name: "Завершить эфир для всех?" });
    fireEvent.click(within(dialog).getByRole("button", { name: /ОК|Да|Завершить/ }));
    await waitFor(() => expect(calls.some((c) => c.key === `POST /api/live/${ID}/stop`)).toBe(true));
  });

  it("«Начать эфир» → «Через OBS Studio…»: эфир начат, у ведущего — сервер и ключ для OBS", async () => {
    vi.stubGlobal("MediaSource", { isTypeSupported: () => true });
    const rtmp = stream({ hostId: ME.id, source: "rtmp", title: "Клуб" });
    const ingest = { url: "rtmp://example.org:1935/live", key: "0123456789abcdef0123456789abcdef" };
    const { calls } = fakeApi({
      "GET /api/live/chat/c_1": { body: { stream: null, viewers: 0, canHost: true } },
      "POST /api/live": { body: { stream: rtmp, ingest } },
      [`POST /api/live/${ID}/join`]: { body: { stream: rtmp, participants: [person(ME.id, "host", "Аня")], messages: [], ingest } },
    });
    renderLive();
    fireEvent.click(await screen.findByRole("button", { name: "Начать эфир" }));
    const choice = await screen.findByRole("dialog", { name: "Начать эфир" });
    fireEvent.click(within(choice).getByRole("button", { name: "Через OBS Studio или другую программу" }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/live")?.body).toEqual({ chatId: "c_1", title: "Клуб", withVideo: true, source: "rtmp" }));
    const live = await screen.findByRole("dialog", { name: "Эфир" });
    expect(await within(live).findByText("Настройки для OBS Studio")).toBeTruthy();
    expect(within(live).getByDisplayValue(ingest.url)).toBeTruthy();
    expect(within(live).getByDisplayValue(ingest.key)).toBeTruthy();
    expect(within(live).getByText("Запустите трансляцию в OBS")).toBeTruthy();
    // Из OBS — без микрофона и камеры в браузере.
    expect(within(live).queryByTitle("Микрофон")).toBeNull();
    expect(within(live).getByText("Завершить эфир")).toBeTruthy();
  });

  it("эфир закончился (live:ended) — «Эфир завершён», «Закрыть»", async () => {
    fakeApi({
      "GET /api/live/chat/c_1": { body: { stream: stream(), viewers: 1, canHost: false, canStop: false } },
      [`POST /api/live/${ID}/join`]: { body: { stream: stream(), participants: [person(HOST, "host", "Лена"), person(ME.id, "viewer", "Аня")], messages: [], ingest: null } },
    });
    renderLive();
    fireEvent.click(await screen.findByRole("button", { name: "Смотреть" }));
    await screen.findByText("Участники — 2");
    act(() => FakeSocket.last().receive({ type: "live:ended", chatId: "c_1", streamId: ID }));
    expect(await screen.findByText("Эфир завершён")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByText("Эфир завершён")).toBeNull();
  });
});
