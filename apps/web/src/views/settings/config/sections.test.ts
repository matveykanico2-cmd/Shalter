import { describe, expect, it } from "vitest";

import { canSeeSection, SETTINGS_SECTIONS } from "./sections";

describe("доступ к разделам администрации", () => {
  const promotions = SETTINGS_SECTIONS.find((s) => s.id === "promotions")!;

  it("«Промокоды» открывает право «Цены» (pricing)", () => {
    expect(promotions.label).toBe("Промокоды");
    expect(canSeeSection(promotions, { adminSections: ["pricing"] })).toBe(true);
    expect(canSeeSection(promotions, { adminSections: ["moderation"] })).toBe(false);
    expect(canSeeSection(promotions, { isDeveloper: true })).toBe(true);
  });
});
