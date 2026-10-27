import { afterEach, describe, expect, it } from "vitest";

import { setTimeFormat } from "@/shared/lib/time-format";

import { readAtLabel } from "./read-at";

afterEach(() => setTimeFormat(24));

describe("«Прочитано … в …»", () => {
  const now = new Date(2026, 9, 27, 23, 0);
  const read = new Date(2026, 9, 27, 22, 30).toISOString();

  it("24 часа по умолчанию, 12 — с AM/PM", () => {
    expect(readAtLabel(read, now)).toBe("Прочитано сегодня в 22:30");
    setTimeFormat(12);
    expect(readAtLabel(read, now)).toBe("Прочитано сегодня в 10:30 PM");
  });
});
