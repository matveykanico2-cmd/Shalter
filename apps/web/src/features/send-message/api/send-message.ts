import type { gamesBody } from "@shalter/shared/schemas/games";
import type { geoIpBody, geoSearchBody } from "@shalter/shared/schemas/geo";
import type { hugoCheckBody } from "@shalter/shared/schemas/integrations";
import type { scheduled, scheduledEnvelope, scheduledList, sendResult } from "@shalter/shared/schemas/messages";
import type { z } from "zod";

import { http, type Uploaded } from "@/shared/api";
import type { Sticker } from "@/shared/lib/anim";

type SendResult = z.infer<typeof sendResult>;

const chatPath = (chatId: string) => `/api/chats/${encodeURIComponent(chatId)}`;

/** Вложение в отправке: загруженный файл (+ спойлер у фото и видео) или опрос, чек-лист, кубик. */
export type OutgoingAttachment =
  | (Uploaded & { spoiler?: true; durationSec?: number; waveform?: number[]; transcript?: string })
  | { kind: "poll" | "checklist" | "dice" | "location" | "contact" | "game"; meta: Record<string, unknown> };

/** Платный пост: цена и размытая миниатюра, которую видят до оплаты. */
export type PaidMediaRequest = { stars: number; blur?: string; width?: number; height?: number };

/**
 * Как отправить: без звука у получателей, с эффектом (в личке), от имени группы, за звёзды;
 * article — статья (Premium): текст «# Заголовок\n\n…», обложка — первое фото.
 */
export type SendOptions = { silent?: true; effect?: string; anonymous?: true; paidMedia?: PaidMediaRequest; article?: true };

type Body = { text: string; replyToId: string | null; clientId: string; attachments?: OutgoingAttachment[]; sticker?: Sticker; topicId?: string; threadRootId?: string } & SendOptions;

/**
 * Сообщение в чат (POST /api/chats/:id/messages) или пост канала (POST /api/posts/:id/publish).
 * clientId — метка отправки: повтор после обрыва сети сервер узнаёт и не создаёт дубль.
 */
export function sendMessage(chatId: string, body: Body, channel: boolean) {
  if (channel) {
    return http.post<SendResult>(`/api/posts/${encodeURIComponent(chatId)}/publish`, {
      text: body.text,
      attachments: body.attachments ?? [],
      clientId: body.clientId,
      ...(body.paidMedia ? { paidMedia: body.paidMedia } : {}),
    });
  }
  const { attachments, sticker, ...rest } = body;
  return http.post<SendResult>(`${chatPath(chatId)}/messages`, { ...rest, ...(attachments?.length ? { attachments } : {}), ...(sticker ? { sticker } : {}) });
}

export const saveDraft = (chatId: string, text: string) => http.post<unknown>(`${chatPath(chatId)}/draft`, { text });

/** «Печатает» и другие действия (upload_photo…; cancel — закончил). */
export const sendTyping = (chatId: string, action = "typing") => http.post<unknown>(`${chatPath(chatId)}/typing`, { action });


/** Примерное место по IP — когда телефон не отдал координаты. */
export const geoByIp = () => http.get<z.infer<typeof geoIpBody>>("/api/geo/ip");

export const geoSearch = (q: string) => http.get<z.infer<typeof geoSearchBody>>(`/api/geo/search?q=${encodeURIComponent(q)}`);

/** Живая геопозиция: новая точка в уже отправленном сообщении. */
export const updateLiveLocation = (chatId: string, messageId: string, lat: number, lng: number) =>
  http.post<unknown>(`${chatPath(chatId)}/messages/${encodeURIComponent(messageId)}/location`, { lat, lng });

export type Scheduled = z.infer<typeof scheduled>;
export type RepeatId = NonNullable<Scheduled["repeat"]>;

/** Отправить позже: в срок (sendAt, с повтором) или «когда будет в сети». */
export const scheduleMessage = (
  chatId: string,
  body: { text: string; replyToId: string | null; topicId: string | null; sendAt: string | null; repeat: RepeatId | null; whenOnline: boolean }
) => http.post<z.infer<typeof scheduledEnvelope>>(`${chatPath(chatId)}/messages/scheduled`, body);

export const listScheduled = (chatId: string) => http.get<z.infer<typeof scheduledList>>(`${chatPath(chatId)}/messages/scheduled`);

export const sendScheduledNow = (chatId: string, id: string) => http.patch<unknown>(`${chatPath(chatId)}/messages/scheduled/${encodeURIComponent(id)}`, { sendNow: true });

export const deleteScheduled = (chatId: string, id: string) => http.delete<unknown>(`${chatPath(chatId)}/messages/scheduled/${encodeURIComponent(id)}`);

export const hugoCheck = (text: string) => http.post<z.infer<typeof hugoCheckBody>>("/api/hugo/check", { text });

/** Каталог игр с поиском (GET /api/games?q=) — для «/game название». */
export const searchGames = (q: string) => http.get<z.infer<typeof gamesBody>>(`/api/games?q=${encodeURIComponent(q)}`);

/** «Стоп» в чате с Shalter AI: ответ обрывается, написанное остаётся. */
export const stopAi = (chatId: string) => http.post<unknown>("/api/ai/stop", { chatId });

/** Комментарий к посту канала (POST /api/posts/:id/comments) — в ветку его группы обсуждения. */
export const sendComment = (postId: string, body: { text: string; clientId: string; attachments?: OutgoingAttachment[]; sticker?: Sticker } & SendOptions) => {
  const { attachments, sticker, ...rest } = body;
  return http.post<SendResult>(`/api/posts/${encodeURIComponent(postId)}/comments`, { ...rest, ...(attachments?.length ? { attachments } : {}), ...(sticker ? { sticker } : {}) });
};
