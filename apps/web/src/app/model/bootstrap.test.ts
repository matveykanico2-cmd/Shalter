import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chatQueries, type ChatSummary } from "@/entities/chat";

import { persistChats, restoreCachedChats } from "./bootstrap";

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

const chats = [{ id: "c_1", title: "Дача" }] as ChatSummary[];

describe("список чатов прошлого запуска (localCache.js)", () => {
  it("сохраняется после обновления и поднимается при следующем старте — только у того же пользователя", () => {
    vi.useFakeTimers();
    const first = new QueryClient();
    const stop = persistChats(first, "u_1");
    first.setQueryData(chatQueries.list().queryKey, chats);
    first.setQueryData(chatQueries.folders().queryKey, []);
    vi.advanceTimersByTime(1000);
    stop();

    const next = new QueryClient();
    expect(restoreCachedChats(next, "u_2")).toBe(false);
    expect(restoreCachedChats(next, "u_1")).toBe(true);
    expect(next.getQueryData(chatQueries.list().queryKey)).toEqual(chats);
    expect(next.getQueryData(chatQueries.folders().queryKey)).toEqual([]);
  });

  it("старше суток — не показывается", () => {
    localStorage.setItem("shalter.cache.1.u_1.chats", JSON.stringify({ at: Date.now() - 25 * 3600_000, data: { chats } }));
    expect(restoreCachedChats(new QueryClient(), "u_1")).toBe(false);
  });
});
