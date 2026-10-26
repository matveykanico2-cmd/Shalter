import type { contactListItem } from "@shalter/shared/schemas/contacts";
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
  | { kind: "poll" | "checklist" | "dice" | "location" | "contact"; meta: Record<string, unknown> };

/** Как отправить: без звука у получателей, с эффектом (в личке). */
export type SendOptions = { silent?: true; effect?: string };

type Body = { text: string; replyToId: string | null; clientId: string; attachments?: OutgoingAttachment[]; sticker?: Sticker; topicId?: string } & SendOptions;

/**
 * Сообщение в чат (POST /api/chats/:id/messages) или пост канала (POST /api/posts/:id/publish).
 * clientId — метка отправки: повтор после обрыва сети сервер узнаёт и не создаёт дубль.
 */
export function sendMessage(chatId: string, body: Body, channel: boolean) {
  if (channel) return http.post<SendResult>(`/api/posts/${encodeURIComponent(chatId)}/publish`, { text: body.text, attachments: body.attachments ?? [], clientId: body.clientId });
  const { attachments, sticker, ...rest } = body;
  return http.post<SendResult>(`${chatPath(chatId)}/messages`, { ...rest, ...(attachments?.length ? { attachments } : {}), ...(sticker ? { sticker } : {}) });
}

export const saveDraft = (chatId: string, text: string) => http.post<unknown>(`${chatPath(chatId)}/draft`, { text });

/** «Печатает» и другие действия (upload_photo…; cancel — закончил). */
export const sendTyping = (chatId: string, action = "typing") => http.post<unknown>(`${chatPath(chatId)}/typing`, { action });

/** Свои стикерпаки (GET /api/stickers/packs) — в выборе стикера под встроенными. */
export const getStickerPacks = () => http.get<{ packs: { id: string; name: string; stickers: Sticker[] }[] }>("/api/stickers/packs");

/** Примерное место по IP — когда телефон не отдал координаты. */
export const geoByIp = () => http.get<z.infer<typeof geoIpBody>>("/api/geo/ip");

export const geoSearch = (q: string) => http.get<z.infer<typeof geoSearchBody>>(`/api/geo/search?q=${encodeURIComponent(q)}`);

/** Живая геопозиция: новая точка в уже отправленном сообщении. */
export const updateLiveLocation = (chatId: string, messageId: string, lat: number, lng: number) =>
  http.post<unknown>(`${chatPath(chatId)}/messages/${encodeURIComponent(messageId)}/location`, { lat, lng });

export const listContacts = () => http.get<{ contacts: z.infer<typeof contactListItem>[] }>("/api/contacts");

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
