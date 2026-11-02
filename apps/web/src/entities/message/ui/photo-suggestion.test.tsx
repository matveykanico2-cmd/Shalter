import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  attachments: [{ kind: "image", url: "/uploads/sha_0123456789abcdef.png" }],
  photoSuggestion: true,
  ...patch,
});

afterEach(cleanup);

describe("предложенное фото профиля", () => {
  it("получатель видит кнопку «Установить как фото профиля»", () => {
    const onUse = vi.fn();
    const message = msg({});
    render(<MessageBubble mine={false} message={message} onUseSuggestedPhoto={onUse} />);
    fireEvent.click(screen.getByRole("button", { name: "Установить как фото профиля" }));
    expect(onUse).toHaveBeenCalledWith(message);
  });

  it("отправитель видит подпись, без кнопки", () => {
    render(<MessageBubble mine message={msg({})} onUseSuggestedPhoto={vi.fn()} />);
    expect(screen.getByText("Вы предложили фото профиля")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Установить как фото профиля" })).toBeNull();
  });

  it("обычное фото — ни кнопки, ни подписи", () => {
    render(<MessageBubble mine={false} message={msg({ photoSuggestion: undefined })} onUseSuggestedPhoto={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Установить как фото профиля" })).toBeNull();
  });
});
