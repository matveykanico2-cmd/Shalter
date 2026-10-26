import { describe, expect, it } from "vitest";

import { formatBytes, formatUptime } from "./format";

describe("format", () => {
  it("formatUptime — как в старом клиенте", () => {
    expect(formatUptime(42)).toBe("42 с");
    expect(formatUptime(125)).toBe("2 мин 5 с");
    expect(formatUptime(3 * 3600 + 60)).toBe("3 ч 1 мин");
    expect(formatUptime(2 * 86400 + 5 * 3600)).toBe("2 д 5 ч");
  });
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 Б");
    expect(formatBytes(1536)).toBe("1.5 КБ");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.00 ГБ");
  });
});
