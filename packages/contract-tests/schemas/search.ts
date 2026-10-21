// Глобальный поиск: routes/search.js (/api/search).
import { z } from "zod";
import { chat } from "./chat";
import { game, builtinGame } from "./games";
import { message } from "./message";
import { publicUser, viewerUser } from "./user";

/** Публичный канал/группа, где ищущий ещё не состоит — урезанная карточка. */
export const searchChannel = z.strictObject({
  id: z.string(),
  title: z.string().nullable(),
  username: z.string().optional(),
  description: z.string().optional(),
  avatarColor: z.string().optional(),
  avatarImage: z.string().optional(),
  subscriberCount: z.number().int(),
});

export const searchBody = z.strictObject({
  /** Свои чаты — сырой rowToChat. */
  chats: z.array(chat),
  channels: z.array(searchChannel),
  /** Люди — publicUserFor (приватность и имена из контактов). */
  users: z.array(viewerUser),
  /** Боты — publicUser без приватности. */
  bots: z.array(publicUser),
  games: z.array(z.union([builtinGame, game])),
  /** Сообщения — сырой rowToMessage. */
  messages: z.array(message),
});
