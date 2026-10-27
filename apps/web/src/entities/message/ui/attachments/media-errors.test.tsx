import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { audioFor } from "@/shared/lib/media/now-playing";

import type { Attachment } from "../../model/attachment";
import type { FeedMessage } from "../../model/types";

import { VideoAttachment } from "./video-attachment";
import { VideoNotePlayer } from "./video-note-player";
import { VoicePlayer } from "./voice-player";

afterEach(cleanup);

const msg = (patch: Partial<FeedMessage> = {}) => ({ id: "m1", chatId: "c1", type: "text", text: "", createdAt: new Date().toISOString(), ...patch }) as FeedMessage;

/** Файл не отдался (404 без доступа, удалён): у элемента появляется error и приходит событие. */
function failMedia(el: HTMLMediaElement) {
  Object.defineProperty(el, "error", { value: { code: 4 }, configurable: true });
  act(() => {
    el.dispatchEvent(new Event("error"));
  });
}

describe("медиа, которое не загрузилось, — «Повторить», а не вечная кнопка", () => {
  it("видео: не отдались ни обложка, ни ролик — плашка, нажатие запрашивает заново", () => {
    const a: Attachment = { kind: "video", url: "/uploads/old_0123456789abcdef.mp4", thumbUrl: "/uploads/old_0123456789abcdef.jpg" };
    const { container } = render(<VideoAttachment attachment={a} messageId="m1" />);
    fireEvent.error(container.querySelector("img")!);
    fireEvent.error(container.querySelector("video")!);
    expect(container.querySelector("video")).toBeNull();
    const plate = screen.getByText("Не загрузилось").closest("[role=button]")!;
    fireEvent.click(plate);
    expect(screen.queryByText("Не загрузилось")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^\/uploads\/old_0123456789abcdef\.jpg\?r=/);
  });

  it("видео: «обрабатывается» у старого сообщения — обычная кнопка, у свежего — индикатор", () => {
    const a: Attachment = { kind: "video", url: "/uploads/v_0123456789abcdef.mp4", previewPending: true };
    const { rerender } = render(<VideoAttachment attachment={a} messageId="m1" sentAt={new Date().toISOString()} />);
    expect(screen.getByLabelText("Видео обрабатывается")).toBeTruthy();
    rerender(<VideoAttachment attachment={a} messageId="m1" sentAt="2026-09-01T10:00:00.000Z" />);
    expect(screen.queryByLabelText("Видео обрабатывается")).toBeNull();
  });

  it("кружок: ролик не загрузился — спрятан, вместо «играть» — «Не загрузилось»", () => {
    const a: Attachment = { kind: "video-note", url: "/uploads/n_0123456789abcdef.mp4", durationSec: 7 };
    const { container } = render(<VideoNotePlayer attachment={a} message={msg()} senderName="Боб" />);
    const video = container.querySelector("video")!;
    expect(screen.getByLabelText("Смотреть видеосообщение")).toBeTruthy();
    failMedia(video);
    expect(video.hidden).toBe(true);
    expect(screen.getByLabelText("Повторить загрузку видеосообщения")).toBeTruthy();
    expect(screen.getByText("Не загрузилось")).toBeTruthy();
  });

  it("голосовое: файл не отдался — кнопка «Повторить загрузку» и подсказка вместо длительности", () => {
    const a: Attachment = { kind: "voice", url: "/uploads/v_fedcba9876543210.ogg", durationSec: 3 };
    const m = msg({ id: "m-voice-fail" });
    render(<VoicePlayer attachment={a} message={m} senderName="Боб" />);
    expect(screen.getByLabelText("Слушать")).toBeTruthy();
    failMedia(audioFor(`${m.id}:${a.url}`, a.url!));
    expect(screen.getByLabelText("Повторить загрузку")).toBeTruthy();
    expect(screen.getByText(/Не загрузилось/)).toBeTruthy();
  });
});
