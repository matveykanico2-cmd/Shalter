import { describe, expect, it } from "vitest";
import { validAvatarColor } from "./avatar-color.js";

describe("validAvatarColor", () => {
  it("принимает цвета и безопасные градиенты", () => {
    expect(validAvatarColor("#1e88e5")).toBe(true);
    expect(validAvatarColor("transparent")).toBe(true);
    expect(validAvatarColor("linear-gradient(135deg, #6e56c6, #c94f8e)")).toBe(true);
  });

  it("отклоняет CSS со ссылками и выражениями", () => {
    expect(validAvatarColor("url(https://example.com/track)")).toBe(false);
    expect(validAvatarColor("red; background:url(//example.com)")).toBe(false);
  });
});
