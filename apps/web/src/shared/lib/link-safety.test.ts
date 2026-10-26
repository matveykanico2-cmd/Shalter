import { describe, expect, it } from "vitest";

import { embedUrlFor, isNeverFrameable, linkSafety } from "./link-safety";

describe("ссылки", () => {
  it("подозрительные ссылки", () => {
    expect(linkSafety("http://a.ru").unsafe).toBe(true);
    expect(linkSafety("https://user@a.ru").unsafe).toBe(true);
    expect(linkSafety("https://bit.ly/x")).toEqual({ unsafe: false, warning: "Сокращённая ссылка — настоящий адрес скрыт" });
    expect(linkSafety("https://a.ru")).toEqual({ unsafe: false, warning: null });
  });

  it("ролики — плеером; крупные сайты — сразу снаружи", () => {
    expect(embedUrlFor("https://www.youtube.com/watch?v=abc")).toBe("https://www.youtube.com/embed/abc");
    expect(embedUrlFor("https://youtu.be/abc")).toBe("https://www.youtube.com/embed/abc");
    expect(embedUrlFor("https://vimeo.com/123")).toBe("https://player.vimeo.com/video/123");
    expect(embedUrlFor("https://a.ru/x")).toBe("https://a.ru/x");
    expect(isNeverFrameable("https://gist.github.com/x")).toBe(true);
    expect(isNeverFrameable("https://a.ru")).toBe(false);
  });
});
