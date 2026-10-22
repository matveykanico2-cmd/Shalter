import type { message } from "@shalter/shared/schemas/message";
import type { historyPage, replyTarget } from "@shalter/shared/schemas/messages";
import type { z } from "zod";

export type Message = z.infer<typeof message>;

/** Сообщение в ленте: pending — временный пузырь, пока сервер не ответил на отправку. */
export type FeedMessage = Message & { pending?: true };

/** Цель ответа, которой нет на загруженных страницах (или «удалённое сообщение»). */
export type ReplyTarget = z.infer<typeof replyTarget>;

export type HistoryPage = z.infer<typeof historyPage>;

/** Лента чата в кэше: загруженные страницы, слитые с событиями сокета и своими отправками. */
export type History = {
  messages: FeedMessage[];
  hasMore: boolean;
  /** firstUnreadId последнего ответа сервера (до того, как этот запрос отметил прочитанным). */
  firstUnreadId: string | null;
  replyTargets: Record<string, ReplyTarget>;
  /**
   * Пришли событием или только что отправлены, но в ответе сервера их ещё нет: сверка
   * не должна их выкинуть (ответ мог уйти раньше, чем сообщение сохранилось).
   */
  unconfirmed: string[];
};
