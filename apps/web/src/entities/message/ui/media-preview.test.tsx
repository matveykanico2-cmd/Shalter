import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { hasMediaPreview } from "../lib/media-preview";
import type { Message } from "../model/types";

import { MediaPreview } from "./media-preview";

const msg = (patch: Partial<Message>) => ({ type: "text", text: "", ...patch }) as Message;

afterEach(cleanup);

describe("превью сообщения с медиа (mediaPreview.js)", () => {
  it("фото — миниатюра и подпись, без подписи — «3 фото»", () => {
    const photos = [1, 2, 3].map((i) => ({ kind: "image", url: `/uploads/p${i}.jpg`, thumbUrl: `/uploads/t${i}.jpg` }));
    const { container, rerender } = render(<MediaPreview message={msg({ attachments: photos, text: "Закат" })} who="Вы: " />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/uploads/t1.jpg");
    expect(container.textContent).toBe("Вы: Закат");
    rerender(<MediaPreview message={msg({ attachments: photos })} />);
    expect(screen.getByText("3 фото")).toBeTruthy();
  });

  it("голосовое — значок и длительность; кружок — круглый кадр", () => {
    const { container, rerender } = render(<MediaPreview message={msg({ attachments: [{ kind: "voice", url: "/uploads/v.webm", durationSec: 67 }] })} />);
    expect(container.textContent).toBe("1:07");
    expect(container.querySelector("svg")).toBeTruthy();
    rerender(<MediaPreview message={msg({ attachments: [{ kind: "video-note", url: "/uploads/n.mp4" }] })} />);
    expect(container.textContent).toBe("Кружок");
    expect(container.querySelector("video")?.getAttribute("src")).toBe("/uploads/n.mp4#t=0.1");
  });

  it("видео — значок «играть» поверх обложки; файл — обычной строкой", () => {
    const { container, rerender } = render(<MediaPreview message={msg({ attachments: [{ kind: "video", url: "/uploads/v.mp4", posterUrl: "/uploads/v.jpg", durationSec: 5 }] })} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/uploads/v.jpg");
    expect(container.textContent).toBe("0:05");
    rerender(<MediaPreview message={msg({ attachments: [{ kind: "file", url: "/uploads/a.pdf", name: "отчёт.pdf" }] })} />);
    expect(container.textContent).toContain("отчёт.pdf");
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("📄");
  });

  it("подарок — его название; без вложений и подарка превью не нужно", () => {
    render(<MediaPreview message={msg({ type: "gift", gift: { name: "Мишка", emoji: "🧸" } })} />);
    expect(screen.getByText("Мишка")).toBeTruthy();
    expect(hasMediaPreview(msg({ text: "привет" }))).toBe(false);
    expect(hasMediaPreview(msg({ type: "gift", gift: { name: "Мишка" } }))).toBe(true);
  });
});
