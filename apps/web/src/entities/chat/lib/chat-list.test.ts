import { describe, expect, it } from "vitest";

import { setTimeFormat } from "@/shared/lib/time-format";

import type { ChatSummary } from "../model/types";

import { isChatMuted, sortChats, timeLabel } from "./chat-list";

// Перенесено из packages/contract-tests/unit/chatSort.test.ts (тест public/js/lib/chatSort.js).
const chat = (id: string, extra: Partial<ChatSummary> = {}) => ({ id, createdAt: "2026-01-01T00:00:00.000Z", ...extra }) as ChatSummary;
const at = (iso: string) => ({ lastMessage: { createdAt: iso } }) as Partial<ChatSummary>;

describe("порядок списка чатов", () => {
  it("закреплённые — сверху, в заданном порядке; без места — после упорядоченных", () => {
    const list = [
      chat("a", at("2026-05-05T00:00:00.000Z")),
      chat("p1", { pinned: true, pinOrder: 1, ...at("2026-01-02T00:00:00.000Z") }),
      chat("p0", { pinned: true, pinOrder: 0, ...at("2026-01-01T00:00:00.000Z") }),
      chat("pNull", { pinned: true, pinOrder: null, ...at("2026-09-09T00:00:00.000Z") }),
      chat("b", at("2026-06-06T00:00:00.000Z")),
    ];
    expect(sortChats(list).map((c) => c.id)).toEqual(["p0", "p1", "pNull", "b", "a"]);
  });

  it("незакреплённые — по свежести последнего сообщения, без него — по дате создания", () => {
    const list = [chat("old", at("2026-01-01T00:00:00.000Z")), chat("empty", { createdAt: "2026-03-01T00:00:00.000Z" }), chat("new", at("2026-02-01T00:00:00.000Z"))];
    expect(sortChats(list).map((c) => c.id)).toEqual(["empty", "new", "old"]);
  });

  it("не меняет исходный массив", () => {
    const list = [chat("x", at("2026-01-01T00:00:00.000Z")), chat("y", at("2026-02-01T00:00:00.000Z"))];
    sortChats(list);
    expect(list.map((c) => c.id)).toEqual(["x", "y"]);
  });

  it("isChatMuted: навсегда, на срок (не истёк / истёк), не заглушён", () => {
    expect(isChatMuted({ muted: true, mutedUntil: null })).toBe(true);
    expect(isChatMuted({ muted: false, mutedUntil: new Date(Date.now() + 3600e3).toISOString() })).toBe(true);
    expect(isChatMuted({ muted: false, mutedUntil: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    expect(isChatMuted({ muted: false, mutedUntil: null })).toBe(false);
  });
});

describe("время в строке списка", () => {
  it("сегодня — время по настройке 12/24 часа, раньше — дата", () => {
    const now = new Date(2026, 9, 27, 18, 0);
    const today = new Date(2026, 9, 27, 9, 7).toISOString();
    expect(timeLabel(today, now)).toBe("09:07");
    setTimeFormat(12);
    try {
      expect(timeLabel(today, now)).toBe("09:07 AM");
      expect(timeLabel(new Date(2026, 9, 26, 21, 0).toISOString(), now)).toBe("26.10");
    } finally {
      setTimeFormat(24);
    }
  });
});
