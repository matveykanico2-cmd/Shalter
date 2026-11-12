import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCache } from "@/shared/lib/local-cache";

import { messageQueries } from "../api/message-queries";

import { persistHistories, storedHistory } from "./stored-histories";
import type { FeedMessage, History } from "./types";

const msg = (id: string, extra: Partial<FeedMessage> = {}) => ({ id, chatId: "c1", createdAt: `2026-11-01T10:00:0${id.slice(-1)}.000Z`, ...extra }) as FeedMessage;
const history = (messages: FeedMessage[]): History => ({ messages, hasMore: false, firstUnreadId: "m1", replyTargets: {}, unconfirmed: [] });

afterEach(() => vi.useRealTimers());

describe("ленты прошлого запуска", () => {
  it("сохраняет ленту без неотправленных и отдаёт её, пока последнее сообщение то же", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const stop = persistHistories(client, "u1", (id) => id === "c1");
    client.setQueryData(messageQueries.history("c1").queryKey, history([msg("m1"), msg("m2"), msg("m3", { pending: true })]));
    vi.advanceTimersByTime(2000);
    const stored = storedHistory("c1", "m2");
    expect(stored?.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(stored?.firstUnreadId).toBeNull();
    // В чате появилось новое сообщение — сохранённая лента устарела.
    expect(storedHistory("c1", "m9")).toBeUndefined();
    stop();
  });

  it("чаты, которые хранить нельзя (секретные), и темы не сохраняются", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const stop = persistHistories(client, "u1", (id) => id !== "secret");
    client.setQueryData(messageQueries.history("secret").queryKey, history([msg("m1")]));
    client.setQueryData(messageQueries.history("c2", "t1").queryKey, history([msg("m1")]));
    vi.advanceTimersByTime(2000);
    expect(storedHistory("secret", "m1")).toBeUndefined();
    expect(storedHistory("c2", "m1")).toBeUndefined();
    stop();
  });

  it("выход: ленты стираются из памяти, отложенная запись после стирания не срабатывает", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const stop = persistHistories(client, "u1", () => true);
    client.setQueryData(messageQueries.history("c3").queryKey, history([msg("m1")]));
    vi.advanceTimersByTime(2000);
    expect(storedHistory("c3", "m1")).toBeDefined();
    // Новая лента ждёт отложенной записи, и тут — выход.
    client.setQueryData(messageQueries.history("c4").queryKey, history([msg("m2")]));
    clearCache();
    stop();
    expect(storedHistory("c3", "m1")).toBeUndefined();
    expect(storedHistory("c4", "m2")).toBeUndefined();
  });

  it("другой пользователь не видит ленты прежнего", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const stopA = persistHistories(client, "u1", () => true);
    client.setQueryData(messageQueries.history("c5").queryKey, history([msg("m1")]));
    vi.advanceTimersByTime(2000);
    stopA();
    const stopB = persistHistories(new QueryClient(), "u2", () => true);
    expect(storedHistory("c5", "m1")).toBeUndefined();
    stopB();
  });
});
