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
  it("отвергает стикеры на аватарке", () => {
    for (const v of ["sticker:/uploads/st/abc.webp", "sticker:", "sticker:/etc/passwd"]) expect(cleanAvatarEmoji(v)).toBeUndefined();
  });
});
