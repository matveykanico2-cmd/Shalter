import { describe, expect, it } from "vitest";

import { outgoingSticker, uniquePacks, uniqueStickers } from "./sticker-outgoing";

const packSticker = { id: "st_0000000a", packId: "sp_1_a", url: "/uploads/u1_0123456789abcdef.webp", emoji: "😺", position: 0, createdAt: "2026-10-01T10:00:00.000Z" };

describe("стикер пака в сообщении", () => {
  it("уходит картинкой со своим эмодзи, а не эмодзи-стикером", () => {
    expect(outgoingSticker(packSticker)).toMatchObject({ kind: "image", url: packSticker.url, emoji: "😺", id: packSticker.id, packId: "sp_1_a" });
  });
  it("повторы стикеров и паков убираются", () => {
    expect(uniqueStickers([packSticker, { ...packSticker, id: "st_0000000b" }])).toHaveLength(1);
    expect(uniquePacks([{ id: "a" }, { id: "a" }, { id: "b" }])).toHaveLength(2);
  });
});
