import { describe, expect, it } from "vitest";

import type { ChatMember, ChatSummary } from "@/entities/chat";

import { chatSubtitle } from "./subtitle";

const NOW = new Date(2026, 9, 23, 12, 0);
const member = (id: string, name: string, online = false) => ({ id, name, online }) as ChatMember;
const chat = (patch: Partial<ChatSummary>) => ({ id: "c_1", type: "group", memberIds: [], otherUser: null, ...patch }) as ChatSummary;

describe("подпись в шапке чата (renderHeader в chatView.js)", () => {
  it("личка: в сети, был(а) …, недавно; бот", () => {
    expect(chatSubtitle(chat({ type: "dm", otherUser: { id: "u_l", name: "Лена", online: true } as never }), [], "u_me", null, NOW)).toEqual({ text: "в сети", tone: "online" });
    const ago = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    expect(chatSubtitle(chat({ type: "dm", otherUser: { id: "u_l", name: "Лена", online: false, lastSeen: ago } as never }), [], "u_me", null, NOW).text).toBe("был(а) 5 минут назад");
    expect(chatSubtitle(chat({ type: "dm", otherUser: { id: "u_l", name: "Лена", online: false } as never }), [], "u_me", null, NOW).text).toBe("был(а) недавно");
    expect(chatSubtitle(chat({ type: "dm", otherUser: { id: "u_b", name: "Бот", online: false, isBot: true } as never }), [], "u_me", null, NOW).text).toBe("бот");
  });

  it("группа: участники и кто в сети (кроме себя); канал: подписчики", () => {
    const members = [member("u_me", "Я", true), member("u_l", "Лена", true), member("u_k", "Костя")];
    expect(chatSubtitle(chat({}), members, "u_me", null, NOW).text).toBe("3 участника, 1 в сети");
    expect(chatSubtitle(chat({ type: "channel", membersCount: 21 }), [], "u_me", null, NOW).text).toBe("21 подписчик");
  });

  it("печатает: в личке без имени, в группе с именем, действие подписью", () => {
    const typing = { userId: "u_l", action: "upload_photo" };
    expect(chatSubtitle(chat({ type: "dm", otherUser: { id: "u_l", name: "Лена", online: true } as never }), [], "u_me", typing, NOW)).toEqual({
      text: "отправляет фото…",
      tone: "typing",
    });
    expect(chatSubtitle(chat({}), [member("u_l", "Лена")], "u_me", { userId: "u_l", action: "typing" }, NOW).text).toBe("Лена печатает…");
  });
});
