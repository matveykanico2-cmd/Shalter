import { describe, expect, it } from "vitest";

import { stripJpegMetadata } from "./strip-exif";

// EXIF (big-endian): Orientation=6 и тег GPS-указателя.
function exifSegment(): number[] {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x02, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x99, 0x00, 0x00, 0x00, 0x00];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  return [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
}

const APP0 = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46];
const SCAN = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9];

describe("stripJpegMetadata", () => {
  it("вырезает EXIF с геопозицией, оставляет поворот и картинку байт в байт", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, ...APP0, ...exifSegment(), ...SCAN]);
    const out = stripJpegMetadata(jpeg)!;
    const hex = Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).not.toContain("8825"); // GPS-указателя нет
    expect(hex).toContain("011200030000000100060000"); // Orientation = 6
    expect(hex.endsWith(SCAN.map((b) => b.toString(16).padStart(2, "0")).join(""))).toBe(true);
    // APP0 (JFIF) — сразу после SOI, поворот — за ним.
    expect(hex.startsWith("ffd8" + APP0.map((b) => b.toString(16).padStart(2, "0")).join("") + "ffe1")).toBe(true);
  });

  it("отбрасывает хвост после конца снимка (MPF со своим EXIF)", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, ...APP0, ...SCAN, 0xff, 0xd8, ...exifSegment(), ...SCAN]);
    const out = stripJpegMetadata(jpeg)!;
    expect(out.length).toBe(2 + APP0.length + SCAN.length);
  });

  it("обрезанный файл без EOI — EXIF всё равно вырезан", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, ...exifSegment(), 0xff, 0xda, 0x00, 0x02, 0x11, 0x22]);
    const hex = Array.from(stripJpegMetadata(jpeg)!, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).not.toContain("8825");
    expect(hex.endsWith("ffda00021122")).toBe(true);
  });

  it("убирает индекс MPF (APP2) вместе с хвостом", () => {
    const mpf = [0xff, 0xe2, 0x00, 0x08, 0x4d, 0x50, 0x46, 0x00, 0x01, 0x02];
    const out = stripJpegMetadata(new Uint8Array([0xff, 0xd8, ...APP0, ...mpf, ...SCAN, 0xff, 0xd8, ...SCAN]))!;
    expect(Array.from(out)).toEqual([0xff, 0xd8, ...APP0, ...SCAN]);
  });

  it("без EXIF и не JPEG — null (файл уходит как есть)", () => {
    expect(stripJpegMetadata(new Uint8Array([0xff, 0xd8, ...APP0, ...SCAN]))).toBeNull();
    expect(stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});
