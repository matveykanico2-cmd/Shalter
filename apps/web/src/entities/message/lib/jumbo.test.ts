import { describe, expect, it } from "vitest";

import { customEmojiOnly, jumboEmojiCount } from "./jumbo";

describe("крупные эмодзи", () => {
  it("1–3 эмодзи (с флагами и составными) — крупно, с текстом или больше трёх — нет", () => {
    expect(jumboEmojiCount("😂")).toBe(1);
    expect(jumboEmojiCount(" 👍❤️🇷🇺 ")).toBe(3);
    expect(jumboEmojiCount("👨‍👩‍👧")).toBe(1);
    expect(jumboEmojiCount("😂😂😂😂")).toBe(0);
    expect(jumboEmojiCount("ок 👍")).toBe(0);
    expect(jumboEmojiCount("")).toBe(0);
  });

  it("только свои эмодзи — их номера", () => {
    expect(customEmojiOnly("[ce:0] [ce:2]")).toEqual([0, 2]);
    expect(customEmojiOnly("привет [ce:0]")).toBeNull();
  });
});
