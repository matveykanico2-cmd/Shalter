import { afterEach, describe, expect, it } from "vitest";

import { timeAgo } from "./presence";
import { formatClock, getTimeFormat, setTimeFormat } from "./time-format";

afterEach(() => setTimeFormat(24));

describe("формат времени 12/24", () => {
  const d = new Date(2026, 9, 27, 15, 5);

  it("по умолчанию 24 часа", () => {
    expect(getTimeFormat()).toBe(24);
    expect(formatClock(d)).toBe("15:05");
  });

  it("12 часов — AM/PM, и в «был(а) вчера в …»", () => {
    setTimeFormat(12);
    expect(formatClock(d)).toBe("03:05 PM");
    expect(timeAgo(d.toISOString(), new Date(2026, 9, 28, 20, 0))).toBe("вчера в 03:05 PM");
    setTimeFormat(24);
    expect(timeAgo(d.toISOString(), new Date(2026, 9, 28, 20, 0))).toBe("вчера в 15:05");
  });
});
