import { describe, expect, it } from "vitest";
import { cleanAvatarEmoji } from "./avatar-emoji.js";

describe("cleanAvatarEmoji", () => {
  it("принимает смайлы, в том числе склейки и флаги", () => {
    for (const e of ["🔥", "❤️", "👍🏽", "👨‍👩‍👧", "🇷🇺"]) expect(cleanAvatarEmoji(e)).toBe(e);
  });
  it("пусто или null — убрать", () => {
    expect(cleanAvatarEmoji(null)).toBeNull();
    expect(cleanAvatarEmoji("")).toBeNull();
    expect(cleanAvatarEmoji("  ")).toBeNull();
  });
  it("отвергает текст, длинные строки и не строки", () => {
    for (const v of ["abc", "1", "Ж", "🔥🔥🔥🔥🔥🔥🔥🔥🔥", "🔥 hi", 5, {}, true]) expect(cleanAvatarEmoji(v)).toBeUndefined();
  });
  it("стикер из пака — «sticker:/uploads/…», без выхода из папки", () => {
    expect(cleanAvatarEmoji("sticker:/uploads/st/abc.webp")).toBe("sticker:/uploads/st/abc.webp");
    for (const v of ["sticker:", "sticker:/etc/passwd", "sticker:/uploads/../x", "sticker:/uploads/a b.png", "sticker:https://x/y.png"]) expect(cleanAvatarEmoji(v)).toBeUndefined();
  });
});
