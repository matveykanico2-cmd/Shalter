import { describe, expect, it } from "vitest";

import { emojiImageUrl, encodeEmoji, splitEmoji } from "./emoji-images";

describe("эмодзи картинками", () => {
  it("имя файла — как в tweb", () => {
    expect(encodeEmoji("😀")).toBe("1f600");
    expect(encodeEmoji("❤️")).toBe("2764");
    expect(encodeEmoji("👨‍👩‍👧")).toBe("1f468-200d-1f469-200d-1f467");
    expect(encodeEmoji("#️⃣")).toBe("0023-20e3");
    expect(emojiImageUrl("👍🏽")).toBe("/img/emoji/1f44d-1f3fd.png");
  });

  it("текст кусками; ©, ™ и обычный текст — как есть", () => {
    expect(splitEmoji("привет 👋 мир")).toEqual(["привет ", { emoji: "👋" }, " мир"]);
    expect(splitEmoji("🇷🇺👍🏽")).toEqual([{ emoji: "🇷🇺" }, { emoji: "👍🏽" }]);
    expect(splitEmoji("© Shalter™")).toBeNull();
    expect(splitEmoji("просто текст")).toBeNull();
  });
});
