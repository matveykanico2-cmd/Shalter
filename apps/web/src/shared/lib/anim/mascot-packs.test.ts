import { describe, expect, it } from "vitest";

import { ART } from "./drawn-art";
import { AVATAR_PRESETS, MASCOT_PACKS } from "./mascot-packs";
import { renderSticker } from "./stickers";

// Сервер (sanitizeSticker) пропускает scene только такого вида.
const NAME_RE = /^[a-z0-9_-]{1,32}$/;

describe("встроенные стикерпаки с персонажами", () => {
  it("у каждого стикера своя сцена из ART, допустимая сервером, и эмодзи", () => {
    const ids = new Set<string>();
    for (const pack of MASCOT_PACKS) {
      expect(pack.stickers.length).toBeGreaterThanOrEqual(8);
      for (const s of pack.stickers) {
        const scene = s.scene as string;
        expect(scene).toMatch(NAME_RE);
        expect(ART[scene]).toBeTruthy();
        expect(s.emoji).toBeTruthy();
        expect(ids.has(s.id!)).toBe(false);
        ids.add(s.id!);
      }
    }
  });

  it("стикер рисуется своим рисунком, а не общей сценой по эмодзи", () => {
    const s = MASCOT_PACKS[0]!.stickers[0]!;
    const node = renderSticker(s, { size: 52 }) as HTMLElement;
    expect(node.className).toContain(`art-${s.scene as string}`);
    expect(node.querySelector("svg")).toBeTruthy();
  });

  it("готовые аватары — валидные SVG", () => {
    expect(AVATAR_PRESETS.length).toBeGreaterThanOrEqual(12);
    for (const p of AVATAR_PRESETS) {
      const svg = decodeURIComponent(p.image.split(",")[1]!);
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(doc.querySelector("parsererror")).toBeNull();
    }
  });
});
