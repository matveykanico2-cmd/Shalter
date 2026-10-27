import { describe, expect, it } from "vitest";

import { highlightMatch, searchTimeLabel } from "./highlight";

describe("поиск", () => {
  it("совпадение выделено, длинное начало — с многоточием", () => {
    expect(highlightMatch("Купи молоко", "молоко")).toEqual({ head: "Купи ", hit: "молоко", tail: "" });
    expect(highlightMatch("а".repeat(30) + "нашлось", "нашлось")?.head).toBe("…" + "а".repeat(16));
    expect(highlightMatch("текст", "нет")).toBeNull();
  });

  it("время: сегодня часы, в этом году день", () => {
    const now = new Date("2026-10-26T15:00:00");
    expect(searchTimeLabel("2026-10-26T09:05:00", now)).toBe("09:05");
    expect(searchTimeLabel("2026-03-08T09:05:00", now)).toMatch(/8 мар/);
    expect(searchTimeLabel("2025-03-08T09:05:00", now)).toBe("08.03.25");
  });
});
