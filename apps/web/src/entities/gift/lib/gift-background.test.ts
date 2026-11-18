import { describe, expect, it } from "vitest";

import { GIFT_BACKDROPS, giftBackdrop } from "./gift-background";

describe("фоны подарков", () => {
  it("не предлагает белые и чёрные пресеты", () => {
    expect(GIFT_BACKDROPS.map((item) => item.name).filter((name) => /black|white|platinum/i.test(name))).toEqual([]);
  });

  it("не показывает старый белый или чёрный фон из сохранённого подарка", () => {
    expect(giftBackdrop({ id: "black", from: "#4a4a4f", to: "#151517" })).toBeNull();
    expect(giftBackdrop({ id: "ivory-white", from: "#fffbea", to: "#e3dcc2" })).toBeNull();
  });
});
