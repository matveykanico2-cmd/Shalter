import { describe, expect, it } from "vitest";

import { BUILTIN_STICKER_PACKS, findBuiltinPack } from "./builtin-packs";
import { outgoingSticker } from "./sticker-outgoing";

describe("findBuiltinPack — пак встроенного стикера из сообщения", () => {
  it("каждый встроенный стикер после отправки находит свой пак", () => {
    for (const pack of BUILTIN_STICKER_PACKS) {
      for (const s of pack.stickers) expect(findBuiltinPack(outgoingSticker(s))?.id).toBe(pack.id);
    }
  });

  it("чужой стикер — не встроенный", () => {
    expect(findBuiltinPack({ id: "st_1", scene: undefined })).toBeNull();
    expect(findBuiltinPack({ scene: "no-such-scene" })).toBeNull();
  });
});
