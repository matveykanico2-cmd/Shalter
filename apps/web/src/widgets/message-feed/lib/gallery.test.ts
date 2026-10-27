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

  describe("платные посты", () => {
    const paidAtt = { kind: "paid", meta: { stars: 25, photos: 1, videos: 1 } };
    const feed = [
      m("m_1", [{ kind: "image", url: "/before" }]),
      m("m_paid", [paidAtt], { text: "закрытое" }),
      m("m_3", [{ kind: "image", url: "/after" }]),
    ];
    const unlocked = [
      { kind: "image", url: "/p1" },
      { kind: "video", url: "/p2", previewUrl: "/p2-small" },
    ];

    it("открытый пост (автор, админ, купивший) — его фото и видео на месте заглушки", () => {
      const items = buildGallery(feed, () => "Канал", (x) => (x.id === "m_paid" ? (unlocked as never) : null));
      expect(items.map((i) => [i.messageId, i.url])).toEqual([
        ["m_1", "/before"],
        ["m_paid", "/p1"],
        ["m_paid", "/p2-small"],
        ["m_3", "/after"],
      ]);
      expect(items[1]!.caption).toBe("закрытое");
      expect(galleryIndex(items, "m_paid", "/p1")).toBe(1);
      expect(galleryIndex(items, "m_paid", "/p2")).toBe(2);
      expect(galleryIndex(items, "m_3", "/after")).toBe(3);
    });

    it("закрытый или ещё не загруженный пост в галерею не попадает", () => {
      for (const paidOf of [undefined, () => null, () => undefined]) {
        const items = buildGallery(feed, () => null, paidOf);
        expect(items.map((i) => i.url)).toEqual(["/before", "/after"]);
        expect(galleryIndex(items, "m_3", "/after")).toBe(1);
        expect(galleryIndex(items, "m_paid", "/p1")).toBe(-1);
      }
    });
  });
});
