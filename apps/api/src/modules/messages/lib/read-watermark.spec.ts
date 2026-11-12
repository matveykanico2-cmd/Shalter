import { describe, expect, it } from "vitest";
import { READ_WATERMARK_MARGIN_MS, readScanFrom } from "./read-watermark.js";

const now = Date.parse("2026-11-12T12:00:00.000Z");

describe("readScanFrom", () => {
  it("без границы — весь чат", () => {
    expect(readScanFrom(null, now)).toBeNull();
    expect(readScanFrom("мусор", now)).toBeNull();
  });

  it("граница в прошлом — минус запас", () => {
    expect(readScanFrom("2026-11-12T11:00:00.000Z", now)).toBe(new Date(Date.parse("2026-11-12T11:00:00.000Z") - READ_WATERMARK_MARGIN_MS).toISOString());
  });

  it("граница в будущем (дата из будущего у сообщения) — не позже «сейчас» минус запас", () => {
    expect(readScanFrom("2027-01-01T00:00:00.000Z", now)).toBe(new Date(now - READ_WATERMARK_MARGIN_MS).toISOString());
  });
});
