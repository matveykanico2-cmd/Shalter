import { describe, expect, it } from "vitest";

import { internalRoute, linkSafety, parseInline, parseText } from "./format-text";

describe("разметка сообщения (как public/js/lib/formatText.js)", () => {
  it("строчная разметка", () => {
    expect(parseInline("**ж** *к* `код` ~~з~~ __п__ ||тайна|| [сайт](https://a.ru) https://b.ru @Anna #тег [ce:3]")).toEqual([
      { kind: "bold", text: "ж" },
      { kind: "text", text: " " },
      { kind: "italic", text: "к" },
      { kind: "text", text: " " },
      { kind: "code", text: "код" },
      { kind: "text", text: " " },
      { kind: "strike", text: "з" },
      { kind: "text", text: " " },
      { kind: "underline", text: "п" },
      { kind: "text", text: " " },
      { kind: "spoiler", text: "тайна" },
      { kind: "text", text: " " },
      { kind: "link", href: "https://a.ru", label: "сайт" },
      { kind: "text", text: " " },
      { kind: "link", href: "https://b.ru", label: "https://b.ru" },
      { kind: "text", text: " " },
      { kind: "mention", handle: "anna", text: "@Anna" },
      { kind: "text", text: " " },
      { kind: "hashtag", text: "#тег" },
      { kind: "text", text: " " },
      { kind: "emoji", index: 3 },
    ]);
  });

  it("блок кода с языком, без разметки внутри", () => {
    expect(parseText("до\n```js\nconst **a** = 1\n```")).toEqual([
      { kind: "line", inline: [{ kind: "text", text: "до" }] },
      { kind: "code", code: "const **a** = 1", lang: "js" },
    ]);
  });

  it("подряд идущие «> » — одна цитата; таблица с заголовком", () => {
    const blocks = parseText("> раз\n> два\nтекст\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(blocks[0]).toEqual({ kind: "quote", lines: [[{ kind: "text", text: "раз" }], [{ kind: "text", text: "два" }]] });
    expect(blocks[1]).toEqual({ kind: "line", inline: [{ kind: "text", text: "текст" }] });
    expect(blocks[2]).toEqual({
      kind: "table",
      header: [[{ kind: "text", text: "a" }], [{ kind: "text", text: "b" }]],
      rows: [[[{ kind: "text", text: "1" }], [{ kind: "text", text: "2" }]]],
    });
  });

  it("ссылки на себя открываются внутри; /имя — профиль", () => {
    expect(internalRoute("https://app.test/chat/c_1", "https://app.test")).toBe("/chat/c_1");
    expect(internalRoute("https://app.test/anna", "https://app.test")).toBe("/u/anna");
    expect(internalRoute("https://app.test/settings", "https://app.test")).toBe("/settings");
    expect(internalRoute("https://other.test/anna", "https://app.test")).toBeNull();
  });

  it("подозрительные ссылки", () => {
    expect(linkSafety("http://a.ru").unsafe).toBe(true);
    expect(linkSafety("https://user@a.ru").unsafe).toBe(true);
    expect(linkSafety("https://bit.ly/x")).toEqual({ unsafe: false, warning: "Сокращённая ссылка — настоящий адрес скрыт" });
    expect(linkSafety("https://a.ru")).toEqual({ unsafe: false, warning: null });
  });
});
