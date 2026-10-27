import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Message } from "../model/types";

import { MessageBubble } from "./message-bubble";

const msg = (patch: Partial<Message>): Message => ({
  id: "m_1",
  chatId: "c_1",
  senderId: "u_lena00000",
  type: "text",
  text: "",
  createdAt: "2026-10-22T10:05:00.000Z",
  pinned: false,
  replyToId: null,
  reactions: [],
  readByIds: [],
  deletedForIds: [],
  mentionedUserIds: [],
  views: null,
  ...patch,
});

afterEach(cleanup);

describe("статья в ленте", () => {
  it("карточка: обложка, заголовок, тело в markdown, «⭐ Premium» и время", () => {
    const { container } = render(
      <MessageBubble
        mine={false}
        message={msg({
          type: "article",
          text: "# Как варить кофе\n\nНужна **вода**.\n\n## Зёрна\n- арабика\n- робуста\n> цитата",
          attachments: [{ kind: "image", url: "/uploads/cover.jpg" }],
        })}
      />
    );
    const card = screen.getByRole("article", { name: "Как варить кофе" });
    expect(screen.getByRole("heading", { level: 2, name: "Как варить кофе" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Зёрна" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["арабика", "робуста"]);
    expect(card.querySelector("b")?.textContent).toBe("вода");
    expect(card.querySelector("img")?.getAttribute("src")).toBe("/uploads/cover.jpg");
    // Обложка — в карточке, а не отдельным фото над ней; «# » в текст не попадает.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(card.textContent).not.toContain("# ");
    expect(screen.getByText("⭐ Premium")).toBeTruthy();
    expect(card.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("старая запись без текста — «Статья недоступна»", () => {
    render(<MessageBubble mine={false} message={msg({ type: "article", text: "" })} />);
    expect(screen.getByText("Статья недоступна")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("обычное сообщение «# x» — не заголовок", () => {
    render(<MessageBubble mine={false} message={msg({ text: "# x\n## тоже нет\n- и не список" })} />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("⭐ Premium")).toBeNull();
  });
});
