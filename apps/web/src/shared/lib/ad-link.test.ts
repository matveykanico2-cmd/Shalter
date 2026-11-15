import { describe, expect, it } from "vitest";

import { internalAdRoute } from "./ad-link";

describe("internalAdRoute", () => {
  it("открывает чат с ботом по ссылке Shalter", () => {
    expect(internalAdRoute("https://shalter.ru/@helper_bot?start=promo")).toBe("/u/helper_bot?start=promo");
  });

  it("оставляет внутренние пути и отбрасывает чужие сайты", () => {
    expect(internalAdRoute("/chat/c_1")).toBe("/chat/c_1");
    expect(internalAdRoute("https://example.com/@helper_bot")).toBeNull();
  });
});
