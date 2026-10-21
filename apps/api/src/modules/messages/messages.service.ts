import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { hugoAi, privacyRules, settings, textCrypto } from "../../legacy/legacy.js";
import type { Chat } from "../chats/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { broadcastToOtherMembers } from "./lib/broadcast.js";
import { MessagesRepository } from "./messages.repository.js";
import type { Message } from "./model/domain.js";
import type { AtQueryDto, DaysQueryDto, HistoryQueryDto, SearchQueryDto } from "./model/schemas/message.schema.js";
import { SummaryStore } from "./stores/summary.store.js";

const SUMMARY_MIN_CHARS = 400;

const queryString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** Цель ответа, которой нет на странице: кратко, или deleted — удалена или скрыта у читателя. */
type ReplyTarget =
  | { id: string; deleted: true }
  | {
      id: string;
      senderId: string;
      anonymous: boolean;
      type: string;
      text: string;
      attachments: { kind: string; name?: string }[];
      sticker?: { emoji?: string };
      gift?: { name?: string };
    };

// Чтение переписки: страницы истории с отметкой прочтения, поиск, ветки, кто прочитал,
// календарь по дням, ИИ-сводка.
@Injectable()
export class MessagesService {
  public constructor(
    private readonly messages: MessagesRepository,
    private readonly users: UsersRepository,
    private readonly summaries: SummaryStore
  ) {}

  /** Страница истории; открытие чата отмечает чужие сообщения прочитанными (message:read авторам). */
  public async history(uid: string, chat: Chat, query: HistoryQueryDto) {
    const userSettings = await settings().getSettings(uid);
    const limit = Math.min(Math.max(Number(query.limit) || 60, 1), 200);
    const before = queryString(query.before);
    const beforeId = queryString(query.beforeId);
    // ?topic=general — тема «Общее», ?topic=<id> — одна тема; без параметра — весь чат.
    const rawTopic = queryString(query.topic);
    const topic = !chat.topicsEnabled || !rawTopic ? undefined : rawTopic === "general" ? null : rawTopic;
    const page = this.messages.findPage(chat.id, uid, userSettings.chatClears?.[chat.id], { limit, before, beforeId, topic });
    // Скрытый ответ бота виден только адресату (и тем, кто вступил позже, тоже не виден).
    const messages = page.messages.filter((m) => !m.visibleToId || m.visibleToId === uid || m.senderId === uid);
    const firstUnreadId = messages.find((m) => m.senderId !== uid && !(m.readByIds ?? []).includes(uid))?.id ?? null;

    const recordTime = await privacyRules().recordsReadTime(chat, uid);
    const changedIds = this.messages.markChatRead(chat.id, uid, recordTime);
    if (!before && !beforeId) await settings().clearUnreadMark(uid, chat.id);
    if (changedIds.length > 0) {
      broadcastToOtherMembers(chat, uid, {
        type: "message:read",
        chatId: chat.id,
        readerId: uid,
        messageIds: changedIds,
        readAt: recordTime ? new Date().toISOString() : undefined,
      });
    }
    return { messages, hasMore: page.hasMore, firstUnreadId, replyTargets: this.replyTargets(messages, chat.id, uid) };
  }

  private replyTargets(messages: Message[], chatId: string, viewerId: string): Record<string, ReplyTarget> {
    const loaded = new Set(messages.map((m) => m.id));
    const wanted = [...new Set(messages.map((m) => m.replyToId).filter((id): id is string => !!id && !loaded.has(id)))];
    const out: Record<string, ReplyTarget> = {};
    for (const id of wanted) {
      const t = this.messages.findById(id);
      if (!t || t.chatId !== chatId || t.deletedForIds?.includes(viewerId)) {
        out[id] = { id, deleted: true };
        continue;
      }
      out[id] = {
        id,
        senderId: t.senderId,
        anonymous: !!t.anonymous,
        type: t.type,
        text: (t.text ?? "").slice(0, 200),
        attachments: (t.attachments ?? []).slice(0, 1).map((a) => ({ kind: a.kind, name: a.name })),
        sticker: t.sticker ? { emoji: t.sticker.emoji } : undefined,
        gift: t.gift ? { name: t.gift.name } : undefined,
      };
    }
    return out;
  }

  /** Поиск по словам и префиксу последнего слова; скрытое у себя и очищенное не находится. */
  public async search(uid: string, chat: Chat, query: SearchQueryDto) {
    const q = String(query.q ?? "").trim().toLowerCase();
    if (!q) return { messages: [] };
    const clearedBefore = (await settings().getSettings(uid)).chatClears?.[chat.id];
    const match = textCrypto().searchQuery(q);
    const found = (match ? this.messages.search([chat.id], match, 50) : [])
      .filter((m) => !m.deletedForIds?.includes(uid) && (!clearedBefore || m.createdAt > clearedBefore))
      .reverse();
    return { messages: found };
  }

  /** «Кратко»: ИИ-сводка длинного сообщения. Переписку секретного чата во внешнюю модель не отправляем. */
  public async summary(uid: string, chat: Chat, messageId: string) {
    if (chat.secret) throw new ApiError(403, "В секретном чате сводки недоступны");
    const message = this.messages.findById(messageId);
    if (!message || message.chatId !== chat.id || message.deletedForIds?.includes(uid)) throw new ApiError(404, "not found");
    if ((message.text ?? "").length < SUMMARY_MIN_CHARS) throw new ApiError(400, "Сообщение слишком короткое для сводки");

    const key = `${message.id}:${message.editedAt ?? ""}`;
    const cached = this.summaries.get(key);
    if (cached !== undefined) return { summary: cached };

    const ai = hugoAi();
    if (!ai.isAiAvailable()) throw new ApiError(503, "ИИ сейчас недоступен");
    if (!this.summaries.take(uid)) throw new ApiError(429, "Слишком много сводок, подождите минуту");
    const summary = await ai.summarize(message.text);
    if (!summary) throw new ApiError(502, "Не удалось сделать сводку, попробуйте позже");
    this.summaries.set(key, summary);
    return { summary };
  }

  /**
   * Кто и во сколько прочитал — только автору сообщения. Время — если читатель не скрывает
   * от автора «время захода» (как «Прочитано в …» в личке).
   */
  public async readers(uid: string, chat: Chat, messageId: string) {
    const message = this.messages.findById(messageId);
    if (!message || message.chatId !== chat.id || message.senderId !== uid) throw new ApiError(404, "not found");
    const readers = this.messages.readersOf(message.id).filter((r) => r.userId !== uid && chat.memberIds.includes(r.userId));
    const users = new Map(this.users.findByIds(readers.map((r) => r.userId)).map((u) => [u.id, u]));
    const rules = privacyRules();
    const result: { user: Record<string, unknown>; readAt: string | null }[] = [];
    for (const r of readers) {
      const user = users.get(r.userId);
      if (!user) continue;
      const showTime = r.readAt && (await rules.allowsUser(r.userId, "lastSeen", uid));
      result.push({ user: await rules.publicUserFor(user, uid), readAt: showTime ? r.readAt : null });
    }
    result.sort((a, b) => String(b.readAt ?? "").localeCompare(String(a.readAt ?? "")));
    return { readers: result };
  }

  public thread(chat: Chat, messageId: string) {
    const root = this.messages.findById(messageId);
    if (!root || root.chatId !== chat.id) throw new ApiError(404, "not found");
    return { root, replies: this.messages.listThreadReplies(messageId) };
  }

  /** Дни месяца с сообщениями (календарь «перейти к дате»); tz — сдвиг в минутах. */
  public days(chat: Chat, query: DaysQueryDto) {
    const month = String(query.month ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(400, "Нужен месяц в виде ГГГГ-ММ");
    const tz = Number(query.tz);
    return { days: this.messages.listDays(chat.id, month, Number.isFinite(tz) ? tz : 0) };
  }

  /** Первое сообщение с этой даты. */
  public at(chat: Chat, query: AtQueryDto) {
    const day = String(query.day ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ApiError(400, "Нужна дата в виде ГГГГ-ММ-ДД");
    const tz = Number(query.tz);
    return { message: this.messages.firstOfDay(chat.id, day, Number.isFinite(tz) ? tz : 0) };
  }
}
