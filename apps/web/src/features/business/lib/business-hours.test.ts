import { describe, expect, it } from "vitest";

import { businessStatus, formatDayHours, formatStatus, type Hours } from "./business-hours";

const day = (open: string, close: string, closed = false) => ({ open, close, closed });
const WEEK: Hours = {
  mon: day("09:00", "18:00"),
  tue: day("09:00", "18:00"),
  wed: day("22:00", "04:00"),
  thu: day("09:00", "18:00"),
  fri: day("09:00", "18:00"),
  sat: day("09:00", "18:00", true),
  sun: day("09:00", "18:00", true),
};

// 2026-10-26 — понедельник.
const at = (iso: string) => new Date(`${iso}Z`);

describe("часы работы бизнеса", () => {
  it("открыто до конца смены, закрыто — когда откроется", () => {
    expect(formatStatus(businessStatus(WEEK, "UTC", at("2026-10-26T10:00:00")), WEEK)).toBe("Открыто · до 18:00");
    expect(formatStatus(businessStatus(WEEK, "UTC", at("2026-10-26T07:00:00")), WEEK)).toBe("Закрыто · откроется в 09:00");
    expect(formatStatus(businessStatus(WEEK, "UTC", at("2026-10-31T12:00:00")), WEEK)).toBe("Закрыто · откроется в пн в 09:00");
  });

  it("смена через полночь: открыто и после полуночи следующего дня", () => {
    expect(businessStatus(WEEK, "UTC", at("2026-10-29T02:00:00"))).toEqual({ open: true, until: "04:00" });
    expect(formatDayHours(WEEK.wed)).toBe("22:00–04:00 (до след. дня)");
  });

  it("часовой пояс бизнеса, а не браузера", () => {
    // 16:00 UTC — это 19:00 в Москве: уже закрыто.
    expect(businessStatus(WEEK, "Europe/Moscow", at("2026-10-26T16:00:00")).open).toBe(false);
  });
});
