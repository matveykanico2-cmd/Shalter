import { describe, expect, it } from "vitest";

import type { Message } from "../model/types";

import { callLogInfo, messagePreview, plainText } from "./message-preview";

const msg = (patch: Partial<Message>) => ({ type: "text", text: "", ...patch }) as Message;

describe("превью сообщения (как public/js/lib/messagePreview.js)", () => {
  it("разметка снимается, спойлер — точками, свои эмодзи — значком", () => {
    expect(plainText("**жирный** и ||тайна||\n> цитата [ссылка](https://x.ru)")).toBe("жирный и ⠿⠿⠿⠿⠿ цитата ссылка");
    expect(messagePreview(msg({ text: "смотри [ce:12]" }))).toBe("смотри 🎨");
  });

  it("вложения, стикер, подарок, бросок", () => {
    expect(messagePreview(msg({ text: "вот", attachments: [{ kind: "image" }] }))).toBe("📷 Фото · вот");
    expect(messagePreview(msg({ attachments: [{ kind: "file", name: "song.mp3" }] }))).toBe("🎵 song");
    expect(messagePreview(msg({ attachments: [{ kind: "poll" }] }))).toBe("📊 Опрос");
    expect(messagePreview(msg({ attachments: [{ kind: "dice", meta: { emoji: "🎯", value: 6 } }] }))).toBe("🎯 В яблочко!");
    expect(messagePreview(msg({ type: "sticker", sticker: { emoji: "😀" } }))).toBe("😀 Стикер");
    expect(messagePreview(msg({ type: "gift", gift: {} }))).toBe("🎁 Подарок");
  });

  it("звонок: у звонящего и у получателя свой заголовок", () => {
    const missed = { text: "📞 Пропущенный звонок" };
    expect(callLogInfo(missed, true).title).toBe("Отменённый звонок");
    expect(callLogInfo(missed, false).title).toBe("Пропущенный звонок");
    expect(callLogInfo({ text: "📹 Видеозвонок · 1:05" }, false)).toMatchObject({ title: "Входящий видеозвонок", durationSec: 65 });
  });
});
