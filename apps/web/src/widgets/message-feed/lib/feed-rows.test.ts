import { describe, expect, it } from "vitest";

import type { Message } from "@/entities/message";

import { dayLabel, feedRows } from "./feed-rows";

const msg = (id: string, createdAt: string, senderId = "u_a"): Message => ({
  id,
  chatId: "c_1",
  senderId,
  type: "text",
  text: id,
  createdAt,
  pinned: false,
  replyToId: null,
  reactions: [],
  readByIds: [],
  deletedForIds: [],
  mentionedUserIds: [],
  views: null,
});

const NOW = new Date("2026-10-22T15:00:00");

describe("строки ленты (как renderList в public/js/views/chatView.js)", () => {
  it("плашки дней и «Непрочитанные»; серии одного автора в пределах 5 минут", () => {
    const rows = feedRows(
      [
        msg("a", new Date("2026-10-21T10:00:00").toISOString()),
        msg("b", new Date("2026-10-22T10:00:00").toISOString()),
        msg("c", new Date("2026-10-22T10:03:00").toISOString()),
        msg("d", new Date("2026-10-22T10:20:00").toISOString()),
        msg("e", new Date("2026-10-22T10:21:00").toISOString(), "u_b"),
      ],
      "c",
      NOW
    );
    expect(rows.map((r) => (r.kind === "message" ? `${r.key}${r.groupStart ? "<" : ""}${r.groupEnd ? ">" : ""}` : r.kind === "day" ? r.label : "unread"))).toEqual([
      "Вчера",
      "a<>",
      "Сегодня",
      "b<",
      "unread",
      "c>",
      "d<>",
      "e<>",
    ]);
  });

  it("подпись дня", () => {
    expect(dayLabel(new Date("2026-10-01T10:00:00").toISOString(), NOW)).toBe("1 октября");
    expect(dayLabel(new Date("2025-03-08T10:00:00").toISOString(), NOW)).toBe("8 марта 2025 г.");
  });
});
