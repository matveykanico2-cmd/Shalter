import { describe, expect, it } from "vitest";

import type { Message } from "../model/types";

import { ARTICLE_TITLE_RE, buildArticleText, splitArticle } from "./article";
import { parseText } from "./format-text";
import { messagePreview } from "./message-preview";

describe("статья: текст «# Заголовок» + markdown", () => {
  it("собирается и разбирается обратно", () => {
    const text = buildArticleText("  Как  варить кофе ", "\nВода.\n\n## Зёрна\n- арабика\n");
    expect(text).toBe("# Как варить кофе\n\nВода.\n\n## Зёрна\n- арабика");
    expect(ARTICLE_TITLE_RE.test(text)).toBe(true);
    expect(splitArticle(text)).toEqual({ title: "Как варить кофе", body: "Вода.\n\n## Зёрна\n- арабика" });
    expect(buildArticleText("Только заголовок", "  ")).toBe("# Только заголовок");
  });

  it("без строки «# …» — без заголовка; пустой текст — пусто", () => {
    expect(splitArticle("просто текст")).toEqual({ title: "", body: "просто текст" });
    expect(splitArticle("")).toEqual({ title: "", body: "" });
    expect(splitArticle(null)).toEqual({ title: "", body: "" });
  });

  it("превью в списке чатов и в цитате — «📰 Заголовок»", () => {
    const m = (text: string) => ({ type: "article", text, attachments: [{ kind: "image", url: "/uploads/c.jpg" }] }) as unknown as Message;
    expect(messagePreview(m("# Новости недели\n\n**Много** всего"))).toBe("📰 Новости недели");
    expect(messagePreview(m(""))).toBe("📰 Статья");
  });

  it("markdown тела: заголовки разделов и списки — только с markdown", () => {
    const body = "## Раздел\n- раз\n* два\nтекст";
    expect(parseText(body, { markdown: true })).toEqual([
      { kind: "heading", level: 2, inline: [{ kind: "text", text: "Раздел" }] },
      { kind: "list", items: [[{ kind: "text", text: "раз" }], [{ kind: "text", text: "два" }]] },
      { kind: "line", inline: [{ kind: "text", text: "текст" }] },
    ]);
    // Обычное сообщение: «# привет» — строка с хештегом, не заголовок.
    expect(parseText("# привет\n- пункт").map((b) => b.kind)).toEqual(["line", "line"]);
  });
});
