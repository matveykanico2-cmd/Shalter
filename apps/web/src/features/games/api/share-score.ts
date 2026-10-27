import { gameAttachmentFor, type GameRef } from "@/entities/game";

import { http } from "@/shared/api";

/** Shalter.share() из игры — сообщение с карточкой игры в чат, откуда её запустили. */
export const shareGameScore = (chatId: string, game: GameRef, text: string) =>
  http.post<unknown>(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
    text,
    attachments: [gameAttachmentFor({ id: game.id, title: game.title ?? "Игра", emoji: game.emoji, description: game.description })],
    clientId: `g_${Date.now().toString(36)}`,
  });
