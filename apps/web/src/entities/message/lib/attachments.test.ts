import { describe, expect, it } from "vitest";

import type { Message } from "../model/types";

import { clockTime, fileColor, fileExt, formatSize, isAudioFile, isMediaOnly, mediaItem, resampleWaveform } from "./attachments";

const msg = (patch: Partial<Message>) => ({ id: "m_1", type: "text", text: null, ...patch }) as Message;

describe("вложения: подписи (attachments.js)", () => {
  it("размер, время, расширение и цвет плитки", () => {
    expect(formatSize(900)).toBe("900 Б");
    expect(formatSize(1536)).toBe("2 КБ");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1,5 МБ");
    expect(formatSize(25 * 1024 * 1024)).toBe("25 МБ");
    expect(clockTime(65.9)).toBe("1:05");
    expect(fileExt("Отчёт.PDF")).toBe("pdf");
    expect(fileColor("pdf")).toBe("#e65050");
    expect(fileColor("bin")).toBeUndefined();
    expect(isAudioFile({ kind: "file", url: "/u/x", name: "song.mp3" })).toBe(true);
    expect(isAudioFile({ kind: "file", url: "/u/x", name: "a.txt", mimeType: "text/plain" })).toBe(false);
  });

  it("осциллограмма 0..31 сжимается в столбики 0..1", () => {
    expect(resampleWaveform([31, 31, 0, 0], 2)).toEqual([1, 0]);
    expect(resampleWaveform([31], 3)).toEqual([1, 1, 1]);
  });

  it("только медиа — без подписи, карточки ссылки и не стикер", () => {
    const photo = { kind: "image", url: "/uploads/a" };
    expect(isMediaOnly(msg({ attachments: [photo] }))).toBe(true);
    expect(isMediaOnly(msg({ attachments: [photo], text: "подпись" }))).toBe(false);
    expect(isMediaOnly(msg({ attachments: [photo, { kind: "file", url: "/uploads/b" }] }))).toBe(false);
    expect(isMediaOnly(msg({ attachments: [] }))).toBe(false);
    expect(isMediaOnly(msg({ attachments: [{ kind: "video-note", url: "/uploads/n" }] }))).toBe(true);
  });

  it("видео: в просмотре сжатая копия, оригинал — скачать и запасной", () => {
    const item = mediaItem({ kind: "video", url: "/uploads/orig", previewUrl: "/uploads/small", posterUrl: "/uploads/poster" }, { id: "m_1" });
    expect(item).toMatchObject({ url: "/uploads/small", originalUrl: "/uploads/orig", fallbackUrl: "/uploads/orig", thumbUrl: "/uploads/poster" });
    expect(mediaItem({ kind: "image", url: "/uploads/i", thumbUrl: "/uploads/t" }, { id: "m_1" })).toMatchObject({ url: "/uploads/i", thumbUrl: "/uploads/t" });
  });
});

describe("размер фото в ленте", () => {
  it("широкое — 280 в ширину, высокое — 320 в высоту, маленькое — как есть", async () => {
    const { imageBox } = await import("./attachments");
    expect(imageBox({ width: 1920, height: 1080 })).toEqual({ width: 280, height: 158 });
    expect(imageBox({ width: 1080, height: 1920 })).toEqual({ width: 180, height: 320 });
    expect(imageBox({ width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
    expect(imageBox({})).toBeNull();
  });
});
