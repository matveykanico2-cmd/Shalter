import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { broadcastToUsers, serviceLine } from "../../legacy/legacy.js";
import { AdminLogService } from "../chats/admin-log.service.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { can, DENIED, isStaff } from "../chats/lib/chat-permissions.js";
import { isOwnerOrAdminOf } from "../chats/lib/chat-roles.js";
import type { Chat } from "../chats/model/domain.js";
import type { TopicPatch } from "./model/domain.js";
import type { CreateTopicDto, PatchTopicDto, TopicsEnabledDto } from "./model/schemas/topic.schema.js";
import { MAX_TOPICS, TopicsRepository } from "./topics.repository.js";

const MAX_TITLE = 64;

/** Один эмодзи (с модификаторами) — не больше 16 code units; иначе иконки нет. */
function cleanIcon(value: unknown): string | null {
  const icon = String(value ?? "").trim();
  return icon && icon.length <= 16 && !/[\w<>]/.test(icon) ? icon : null;
}

// Темы в группах: включает их владелец или админ; создавать темы могут участники, если это
// не запрещено правом createTopics. Каждое изменение — событие topics:updated участникам.
@Injectable()
export class TopicsService {
  public constructor(
    private readonly topics: TopicsRepository,
    private readonly chats: ChatsRepository,
    private readonly adminLog: AdminLogService
  ) {}

  public list(chat: Chat) {
    const group = this.group(chat);
    return { enabled: !!group.topicsEnabled, topics: group.topicsEnabled ? this.topics.list(group.id) : [] };
  }

  public async setEnabled(uid: string, chat: Chat, dto: TopicsEnabledDto) {
    this.group(chat);
    if (!isOwnerOrAdminOf(chat, uid)) throw new ApiError(403, "Включать темы может только администратор");
    const enabled = !!dto.enabled;
    const updated = this.chats.update(chat.id, { topicsEnabled: enabled })!;
    this.adminLog.record(chat.id, uid, enabled ? "topics_on" : "topics_off");
    if (enabled !== !!chat.topicsEnabled) {
      await serviceLine(updated, uid, (name) => `${name} ${enabled ? "включил(а)" : "выключил(а)"} темы в группе`);
    }
    broadcastToUsers(updated.memberIds, { type: "chat:updated", chat: updated });
    this.notify(updated);
    return { chat: updated, enabled, topics: enabled ? this.topics.list(chat.id) : [] };
  }

  public async create(uid: string, chat: Chat, dto: CreateTopicDto) {
    this.group(chat);
    if (!chat.topicsEnabled) throw new ApiError(400, "В этой группе темы выключены");
    if (!can(chat, uid, "createTopics")) throw new ApiError(403, DENIED.createTopics);
    const title = String(dto.title ?? "").trim().slice(0, MAX_TITLE);
    if (!title) throw new ApiError(400, "Введите название темы");
    if (this.topics.count(chat.id) >= MAX_TOPICS) throw new ApiError(400, `Не больше ${MAX_TOPICS} тем в группе`);
    const topic = this.topics.create(chat.id, { title, icon: cleanIcon(dto.icon), color: dto.color }, uid);
    this.adminLog.record(chat.id, uid, "topic_create", { details: { title } });
    await serviceLine(chat, uid, (name) => `${name} создал(а) тему «${title}»`);
    this.notify(chat);
    return { topic };
  }

  /** Свою тему автор может переименовать; закрывать и править чужие — только админы и модераторы. */
  public async update(uid: string, chat: Chat, topicId: string, dto: PatchTopicDto) {
    this.group(chat);
    const topic = this.topics.findById(topicId);
    if (!topic || topic.chatId !== chat.id) throw new ApiError(404, "Тема не найдена");
    const staff = isStaff(chat, uid);
    if (!staff && topic.createdBy !== uid) throw new ApiError(403, "Недостаточно прав");
    if (!staff && dto.closed !== undefined) throw new ApiError(403, "Закрывать темы могут только администраторы");

    const patch: TopicPatch = {};
    if (dto.title !== undefined) {
      const title = String(dto.title).trim().slice(0, MAX_TITLE);
      if (!title) throw new ApiError(400, "Введите название темы");
      patch.title = title;
    }
    if (dto.icon !== undefined) patch.icon = cleanIcon(dto.icon);
    if (dto.color !== undefined) patch.color = dto.color;
    if (dto.closed !== undefined) patch.closed = !!dto.closed;
    const updated = this.topics.update(topic.id, patch)!;
    if (patch.closed !== undefined && patch.closed !== topic.closed) {
      await serviceLine(chat, uid, (name) => `${name} ${patch.closed ? "закрыл(а)" : "открыл(а)"} тему «${updated.title}»`);
    }
    if (patch.title && patch.title !== topic.title) {
      await serviceLine(chat, uid, (name) => `${name} переименовал(а) тему «${topic.title}» в «${updated.title}»`);
    }
    if (patch.closed !== undefined) this.adminLog.record(chat.id, uid, patch.closed ? "topic_close" : "topic_open", { details: { title: updated.title } });
    else this.adminLog.record(chat.id, uid, "topic_edit", { details: { title: updated.title } });
    this.notify(chat);
    return { topic: updated };
  }

  /** Тема удаляется вместе с сообщениями: каждое — message:deleted участникам. */
  public async remove(uid: string, chat: Chat, topicId: string) {
    this.group(chat);
    const topic = this.topics.findById(topicId);
    if (!topic || topic.chatId !== chat.id) throw new ApiError(404, "Тема не найдена");
    if (!isOwnerOrAdminOf(chat, uid)) throw new ApiError(403, "Удалять темы может только администратор");
    const removedIds = this.topics.delete(topic.id);
    this.adminLog.record(chat.id, uid, "topic_delete", { details: { title: topic.title } });
    await serviceLine(chat, uid, (name) => `${name} удалил(а) тему «${topic.title}»`);
    for (const id of removedIds) broadcastToUsers(chat.memberIds, { type: "message:deleted", chatId: chat.id, id });
    this.notify(chat);
    return { ok: true };
  }

  private group(chat: Chat): Chat {
    if (chat.type !== "group") throw new ApiError(400, "Темы есть только в группах");
    return chat;
  }

  private notify(chat: Chat): void {
    broadcastToUsers(chat.memberIds, { type: "topics:updated", chatId: chat.id });
  }
}
