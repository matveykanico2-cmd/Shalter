import { describe, expect, it } from "vitest";

import type { FeedMessage } from "@/entities/message";

import { buildGallery, galleryIndex } from "./gallery";

const m = (id: string, attachments: unknown[], patch: Partial<FeedMessage> = {}) =>
  ({ id, senderId: "u_l", type: "text", text: null, createdAt: "2026-10-23T10:00:00.000Z", attachments, ...patch }) as FeedMessage;

describe("галерея просмотрщика", () => {
  it("все фото и видео по порядку, с автором и подписью; файлы и временные — нет", () => {
    const items = buildGallery(
      [
        m("m_1", [{ kind: "image", url: "/a" }, { kind: "file", url: "/f" }], { text: "**море**" }),
        m("m_2", [{ kind: "video", url: "/v", previewUrl: "/v-small" }]),
        m("local_1", [{ kind: "image", url: "blob:x" }], { pending: true }),
      ],
      () => "Лена"
    );
    expect(items.map((i) => [i.messageId, i.url, i.caption, i.author])).toEqual([
      ["m_1", "/a", "море", "Лена"],
      ["m_2", "/v-small", undefined, "Лена"],
    ]);
    // Нажали на видео в ленте — там его исходный адрес.
    expect(galleryIndex(items, "m_2", "/v")).toBe(1);
    expect(galleryIndex(items, "m_9", "/a")).toBe(-1);
  });
});
