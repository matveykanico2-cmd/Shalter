import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import type { ChatSummary } from "../model/types";

import { ChatRow } from "./chat-row";

const ME = "u_me0000000";

const chat = (patch: Partial<ChatSummary> = {}) =>
  ({
    id: "c_1",
    type: "group",
    title: "Дача",
    adminIds: [],
    moderatorIds: [],
    ownerIds: [],
    memberTitles: {},
    pinned: false,
    muted: false,
    mutedUntil: null,
    archived: false,
    lastMessage: null,
    unreadCount: 0,
    hasUnreadMention: false,
    otherUser: null,
    draft: null,
    ...patch,
  }) as ChatSummary;

function renderRow(c: ChatSummary) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChatRow chat={c} meId={ME} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return client;
}

const HISTORY = "GET /api/chats/c_1/messages?limit=60";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("строка чата", () => {
  it("наведение мышью — чат и первая страница истории грузятся заранее, повторное наведение не дёргает сервер", async () => {
    const { calls } = fakeApi({
      "GET /api/chats/c_1": { body: { chat: chat(), members: [] } },
      [HISTORY]: { body: { messages: [], hasMore: false, firstUnreadId: null, replyTargets: {} } },
    });
    renderRow(chat());
    const row = screen.getByRole("button", { name: /Дача/ });
    fireEvent.pointerEnter(row.parentElement!, { pointerType: "mouse" });
    await waitFor(() => expect(calls.map((c) => c.key).sort()).toEqual(["GET /api/chats/c_1", HISTORY]));
    fireEvent.pointerEnter(row.parentElement!, { pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(2);
  });

  it("чат с непрочитанными не предзагружается: запрос истории отметил бы их прочитанными", async () => {
    const { calls } = fakeApi({});
    renderRow(chat({ unreadCount: 3 }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: /Дача/ }).parentElement!, { pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(0);
  });

  it("последнее сообщение с фото — миниатюрой и «Вы: »", () => {
    fakeApi({});
    const last = { id: "m1", chatId: "c_1", senderId: ME, type: "text", text: "", createdAt: "2026-10-26T10:00:00.000Z", attachments: [{ kind: "image", url: "/uploads/p.jpg" }] };
    renderRow(chat({ lastMessage: last as ChatSummary["lastMessage"] }));
    const row = screen.getByRole("button", { name: /Дача/ });
    expect(row.textContent).toContain("Вы: Фото");
    expect(row.querySelector('img[src="/uploads/p.jpg"]')).toBeTruthy();
  });

  it("значок звука виден всегда: динамик, у заглушённого — перечёркнутый", () => {
    renderRow(chat());
    const row = screen.getByRole("button", { name: /Дача/ });
    expect(row.querySelector('[data-icon="Volume"]')).toBeTruthy();
    expect(row.querySelector('[data-icon="VolumeOff"]')).toBeNull();
    cleanup();
    renderRow(chat({ muted: true }));
    const muted = screen.getByRole("button", { name: /Дача/ });
    expect(muted.querySelector('[data-icon="VolumeOff"]')).toBeTruthy();
    expect(muted.querySelector('[data-icon="BellOff"]')).toBeNull();
  });
});
