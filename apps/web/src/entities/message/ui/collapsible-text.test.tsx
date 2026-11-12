import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Message } from "../model/types";

import { MessageBubble } from "./message-bubble";

const msg = (text: string): Message => ({
  id: "m_long",
  chatId: "c_1",
  senderId: "u_lena00000",
  type: "text",
  text,
  createdAt: "2026-11-12T10:05:00.000Z",
  pinned: false,
  replyToId: null,
  reactions: [],
  readByIds: [],
  deletedForIds: [],
  mentionedUserIds: [],
  views: null,
  attachments: [],
});

afterEach(cleanup);

describe("длинное сообщение", () => {
  it("свёрнуто кнопкой «Показать полностью», но весь текст в разметке (копирование берёт всё)", () => {
    const text = Array.from({ length: 40 }, (_, i) => `строка ${i + 1}`).join("\n");
    const { container } = render(<MessageBubble mine={false} message={msg(text)} />);
    const toggle = screen.getByRole("button", { name: "Показать полностью" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("строка 40");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Свернуть" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("обычное сообщение не сворачивается", () => {
    render(<MessageBubble mine={false} message={msg("привет")} />);
    expect(screen.queryByRole("button", { name: "Показать полностью" })).toBeNull();
  });
});
