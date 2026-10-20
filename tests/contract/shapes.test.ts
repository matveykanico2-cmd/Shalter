// Общие сущности (пользователь, чат, сообщение) совпадают со строгими схемами
// во всех трёх типах чатов и во всех местах, где они отдаются.
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { chat, chatSummary } from "../schemas/chat";
import { message } from "../schemas/message";
import { publicUser, selfUser } from "../schemas/user";
import { expectOk, expectShape } from "../support/expect";
import { useServer } from "../support/use-server";
import { createChannel, createDm, createGroup, registerUser, sendText } from "../support/seed";

const server = useServer();

describe("форма общих сущностей", () => {
  test("регистрация возвращает selfUser, профиль другого — publicUser", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);
    expectShape(selfUser, a.self, "selfUser");
    expect(a.self).toMatchObject({ phone: a.phone, email: a.email, username: a.username, blockedUserIds: [] });

    const res = await a.api.get(`/api/users/${b.id}`);
    const body = expectOk(res, z.looseObject({ user: publicUser }));
    // В публичном профиле нет приватных полей.
    for (const key of ["email", "blockedUserIds", "referralCode", "adminSections", "passwordHash", "totpSecret", "stars"]) {
      expect(body.user, `поле ${key} не должно утекать`).not.toHaveProperty(key);
    }
  });

  test("личка, группа и канал — chat; список и карточка — chatSummary; сообщение — message", async () => {
    const { baseUrl } = server();
    const a = await registerUser(baseUrl);
    const b = await registerUser(baseUrl);

    const dm = expectShape(chat, await createDm(a, b), "личка");
    const group = expectShape(chat, await createGroup(a, [b]), "группа");
    const channel = expectShape(chat, await createChannel(a, [b]), "канал");
    expect(dm).toMatchObject({ type: "dm", memberIds: [a.id, b.id], adminIds: [], ownerIds: [] });
    expect(dm).not.toHaveProperty("ownerId");
    expect(group).toMatchObject({ type: "group", ownerId: a.id, adminIds: [a.id], ownerIds: [a.id] });
    expect(channel).toMatchObject({ type: "channel", ownerId: a.id, linkedDiscussionChatId: expect.any(String) });

    const sent = expectShape(message, await sendText(a, dm.id, "привет"), "сообщение");
    expect(sent).toMatchObject({ chatId: dm.id, senderId: a.id, type: "text", text: "привет", readByIds: [a.id] });

    const card = expectOk(await a.api.get(`/api/chats/${dm.id}`), z.strictObject({
      chat: chatSummary,
      members: z.array(publicUser),
      commands: z.unknown().nullable(),
      paidMessages: z.unknown().nullable(),
    }));
    expect(card.chat.otherUser?.id).toBe(b.id);
    expect(card.chat.lastMessage?.id).toBe(sent.id);

    const list = expectOk(await b.api.get("/api/chats"), z.strictObject({ chats: z.array(chatSummary) }));
    expect(list.chats.map((c) => c.id).sort()).toEqual([dm.id, group.id, channel.id].sort());
    expect(list.chats.find((c) => c.id === dm.id)).toMatchObject({ unreadCount: 1, otherUser: { id: a.id } });
  });
});
