import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type FeedMessage, type History, messageQueries } from "@/entities/message";

import { clearCache } from "@/shared/lib/local-cache";
import { fakeApi } from "@/shared/lib/test";

import { enqueue, isRetryable, type OutboxEntry, resumeOutbox } from "./outbox";

const stored = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/shared/lib/idb-store", () => ({
  idbPut: async (_store: string, key: string, value: unknown) => void stored.set(key, value),
  idbDelete: async (_store: string, keys: readonly string[]) => keys.forEach((k) => stored.delete(k)),
  idbEntries: async () => [...stored.entries()],
  idbClear: () => stored.clear(),
}));

const empty = (): History => ({ messages: [], hasMore: false, firstUnreadId: null, replyTargets: {}, unconfirmed: [] });
const feed = (client: QueryClient, chatId = "c1") => client.getQueryData(messageQueries.history(chatId).queryKey)?.messages ?? [];

function entry(clientId: string, text: string, chatId = "c1"): OutboxEntry {
  const pending = { id: clientId, chatId, senderId: "me", type: "text", text, createdAt: new Date().toISOString(), attachments: [] } as unknown as FeedMessage;
  return { userId: "me", chatId, channel: false, body: { text, replyToId: null, clientId }, pending, createdAt: Date.now() };
}
const serverMessage = (id: string, text: string) => ({ message: { id, chatId: "c1", senderId: "me", text, createdAt: new Date().toISOString() } });

beforeEach(() => stored.clear());
afterEach(() => {
  clearCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("очередь исходящих", () => {
  it("сбой сервера (502) — пузырь остаётся и сообщение уходит повтором, одно", async () => {
    vi.useFakeTimers();
    let n = 0;
    const api = fakeApi({ "POST /api/chats/c1/messages": () => (++n === 1 ? { status: 502, body: { error: "Bad Gateway" } } : { body: serverMessage("m1", "привет") }) });
    const client = new QueryClient();
    client.setQueryData(messageQueries.history("c1").queryKey, empty());
    const sent = enqueue(client, entry("c_1", "привет"));
    await vi.advanceTimersByTimeAsync(0);
    expect(feed(client).map((m) => [m.id, m.pending])).toEqual([["c_1", true]]);
    expect(stored.has("c_1")).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await sent).id).toBe("m1");
    expect(feed(client).map((m) => m.id)).toEqual(["m1"]);
    expect(api.calls.map((c) => (c.body as { clientId: string }).clientId)).toEqual(["c_1", "c_1"]);
    expect(stored.has("c_1")).toBe(false);
  });

  it("отказ по существу (400) — ошибка отправителю, пузырь убран, в очереди не остаётся", async () => {
    fakeApi({ "POST /api/chats/c1/messages": { status: 400, body: { error: "Сообщение длиннее 20000 символов" } } });
    const client = new QueryClient();
    client.setQueryData(messageQueries.history("c1").queryKey, empty());
    await expect(enqueue(client, entry("c_2", "длинно"))).rejects.toThrow("Сообщение длиннее 20000 символов");
    expect(feed(client)).toEqual([]);
    expect(stored.size).toBe(0);
  });

  it("в одном чате по порядку: второе не уходит, пока первое не дошло", async () => {
    vi.useFakeTimers();
    let first = 0;
    const api = fakeApi({
      "POST /api/chats/c1/messages": (body) =>
        body.clientId === "c_a" && ++first === 1 ? { status: 503, body: { error: "busy" } } : { body: serverMessage(`m_${String(body.clientId)}`, String(body.text)) },
    });
    const client = new QueryClient();
    const a = enqueue(client, entry("c_a", "первое"));
    const b = enqueue(client, entry("c_b", "второе"));
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([a, b]);
    expect(api.calls.map((c) => (c.body as { clientId: string }).clientId)).toEqual(["c_a", "c_a", "c_b"]);
  });

  it("запуск: не ушедшее в прошлый раз — в ленте и уходит; чужое (другой аккаунт) — нет", async () => {
    stored.set("c_old", entry("c_old", "из прошлого запуска"));
    stored.set("c_other", { ...entry("c_other", "чужое"), userId: "other" });
    const api = fakeApi({ "POST /api/chats/c1/messages": { body: serverMessage("m9", "из прошлого запуска") } });
    const client = new QueryClient();
    client.setQueryData(messageQueries.history("c1").queryKey, empty());
    await resumeOutbox(client, "me");
    await vi.waitFor(() => expect(feed(client).map((m) => m.id)).toEqual(["m9"]));
    expect(api.calls).toHaveLength(1);
    expect(stored.has("c_other")).toBe(true);
  });

  it("выход: очередь не досылается", async () => {
    vi.useFakeTimers();
    const api = fakeApi({ "POST /api/chats/c1/messages": { status: 502, body: { error: "down" } } });
    const client = new QueryClient();
    const sent = enqueue(client, entry("c_x", "до выхода"));
    sent.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    clearCache();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.calls).toHaveLength(1);
    await expect(sent).rejects.toThrow();
  });

  it("что повторять: сеть, таймаут, 5xx, 429, 408 — да; 400/403/404 — нет", async () => {
    const { ApiError } = await import("@/shared/api");
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryable(new DOMException("timeout", "TimeoutError"))).toBe(true);
    for (const s of [500, 502, 503, 429, 408]) expect(isRetryable(new ApiError(s, "x", null))).toBe(true);
    for (const s of [400, 401, 403, 404, 413]) expect(isRetryable(new ApiError(s, "x", null))).toBe(false);
  });
});
