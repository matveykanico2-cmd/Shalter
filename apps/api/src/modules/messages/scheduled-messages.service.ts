import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { sanitizers, scheduled } from "../../legacy/legacy.js";
import type { Chat } from "../chats/model/domain.js";
import { MAX_MESSAGE_TEXT } from "./lib/message-content.js";
import { MessageSendService } from "./message-send.service.js";
import type { EditScheduledDto, ScheduleDto } from "./model/schemas/message.schema.js";

const isFutureIso = (value: unknown): boolean =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) && value > new Date().toISOString();

// Отложенные сообщения автора в чате. Отправляет их server/lib/scheduledMessagesSweep.js
// с теми же проверками, что и обычную отправку; «Когда будет в сети» — только в личке.
@Injectable()
export class ScheduledMessagesService {
  public constructor(private readonly sender: MessageSendService) {}

  public async list(uid: string, chat: Chat) {
    return { scheduled: await scheduled().listScheduledFor(chat.id, uid) };
  }

  public async create(uid: string, chat: Chat, body: ScheduleDto) {
    if (body.text != null && typeof body.text !== "string") throw new ApiError(400, "Некорректный текст");
    const { sanitizeAttachments } = sanitizers();
    if (!(body.text as string | null | undefined)?.trim() && !sanitizeAttachments(body.attachments)?.length) throw new ApiError(400, "empty message");
    const store = scheduled();
    if (body.whenOnline === true) {
      if (chat.type !== "dm") throw new ApiError(400, "«Когда будет в сети» — только в личных чатах");
      body.sendAt = store.WHEN_ONLINE;
      body.repeat = null;
    } else if (!isFutureIso(body.sendAt)) {
      throw new ApiError(400, "Время отправки должно быть в будущем");
    }
    // Звёзды за сообщение спишутся при отправке, медленный режим к расписанию не относится.
    await this.sender.gate(chat, uid, body, { charge: false, skipSlowMode: true });

    const entry = await store.addScheduled({
      id: genId("sch"),
      chatId: chat.id,
      senderId: uid,
      text: (body.text as string | undefined) ?? "",
      attachments: sanitizeAttachments(body.attachments),
      replyToId: body.replyToId ?? null,
      topicId: body.topicId ?? null,
      repeat: body.repeat ?? null,
      sendAt: body.sendAt,
      createdAt: new Date().toISOString(),
    });
    // Собеседник в сети — уходит сразу, после ответа на запрос.
    if (body.whenOnline === true) setImmediate(() => store.sendWhenOnline().catch((err) => console.error("when-online send failed:", err)));
    return { scheduled: entry };
  }

  /** Правка своего отложенного; «Отправить сейчас» — срок сейчас, и отправка сразу. */
  public async update(uid: string, chatId: string, scheduledId: string, body: EditScheduledDto) {
    const store = scheduled();
    const existing = await store.getScheduled(scheduledId);
    if (!existing || existing.senderId !== uid || existing.chatId !== chatId) throw new ApiError(404, "not found");
    if (body.sendNow === true) {
      await store.editScheduled(scheduledId, { sendAt: new Date().toISOString() });
      await store.sweepOnce();
      return { ok: true };
    }
    if (body.sendAt !== undefined && !isFutureIso(body.sendAt)) throw new ApiError(400, "Время отправки должно быть в будущем");
    if (body.text !== undefined && typeof body.text !== "string") throw new ApiError(400, "Некорректный текст");
    // Те же правила, что при создании и при правке отправленного сообщения.
    if (typeof body.text === "string") {
      if (body.text.length > MAX_MESSAGE_TEXT) throw new ApiError(400, `Сообщение длиннее ${MAX_MESSAGE_TEXT} символов`);
      if (!body.text.trim() && !existing.attachments?.length) throw new ApiError(400, "Сообщение не может быть пустым");
    }
    return { scheduled: await store.editScheduled(scheduledId, { text: body.text, sendAt: body.sendAt, repeat: body.repeat }) };
  }

  public async remove(uid: string, chatId: string, scheduledId: string) {
    const store = scheduled();
    const existing = await store.getScheduled(scheduledId);
    if (!existing || existing.senderId !== uid || existing.chatId !== chatId) throw new ApiError(404, "not found");
    await store.deleteScheduled(scheduledId);
    return { ok: true };
  }
}
