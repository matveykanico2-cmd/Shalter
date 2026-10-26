import { describe, expect, it } from "vitest";

import { formatShortcut, linkSelection, quoteSelection, wrapSelection } from "./text-format";

describe("форматирование выделенного", () => {
  it("оборачивает и разворачивает", () => {
    expect(wrapSelection("я рад", 2, 5, "**")).toEqual({ text: "я **рад**", start: 9, end: 9 });
    expect(wrapSelection("я **рад**", 2, 9, "**")).toEqual({ text: "я рад", start: 2, end: 5 });
    expect(wrapSelection("ab", 1, 1, "||")).toEqual({ text: "a||||b", start: 3, end: 3 });
    expect(wrapSelection("x", 0, 1, "```").text).toBe("```\nx\n```");
  });

  it("цитата и ссылка", () => {
    expect(quoteSelection("a\nb", 0, 3)).toEqual({ text: "> a\n> b", start: 0, end: 7 });
    expect(quoteSelection("> a\n> b", 0, 7).text).toBe("a\nb");
    expect(linkSelection("тут сайт", 4, 8, "ya.ru")?.text).toBe("тут [сайт](https://ya.ru)");
    expect(linkSelection("тут", 0, 0, "ya.ru")).toBeNull();
  });

  it("сочетания клавиш", () => {
    const key = (code: string, shiftKey = false) => ({ code, shiftKey, ctrlKey: true, metaKey: false, altKey: false });
    expect(formatShortcut(key("KeyB"))).toBe("**");
    expect(formatShortcut(key("KeyP", true))).toBe("||");
    expect(formatShortcut({ ...key("KeyB"), ctrlKey: false })).toBeNull();
  });
});
