// Действия с сообщением — оптимистичные, как в public/js/views/chatView.js: лента меняется
// сразу, запрос идёт в фоне, отказ сервера откатывает правку и показывает его текст.
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { chatCache, chatQueries, type ChatSummary } from "@/entities/chat";
import { historyCache, maxReactionsPerUser, type Message, messageQueries, reactionsOf, toggleReaction } from "@/entities/message";
import type { SelfUser } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { deleteMessage, editMessage, forwardMessage, type ForwardOrigin, pinMessage, reactToMessage } from "../api/message-actions";

const fail = (err: unknown, fallback: string) => toast(errorText(err, fallback), { error: true });

// Реакции: пока нажатие летит на сервер, ответ на устаревшее не применяется — иначе
// снятая реакция «возвращалась» из ответа, ушедшего до снятия.
const reactOps = new Map<string, { seq: number; pending: number }>();

export function useMessageActions(chat: ChatSummary, me: SelfUser) {
  const client = useQueryClient();
  const chatId = chat.id;
  const isPremium = !!me.isPremium;
  return useMemo(() => {
    const reconcile = () => void client.invalidateQueries({ queryKey: messageQueries.history(chatId).queryKey });

    return {
      async edit(m: Message, text: string) {
        const editedAt = new Date().toISOString();
        const before = historyCache.patch(client, chatId, m.id, (x) => ({ ...x, text, editedAt }));
        chatCache.patchLastMessage(client, chatId, m.id, { text, editedAt });
        try {
          const { message } = await editMessage(chatId, m.id, text);
          historyCache.replace(client, chatId, message);
          chatCache.patchLastMessage(client, chatId, m.id, message);
        } catch (err) {
          if (before) {
            historyCache.restore(client, chatId, before);
            chatCache.patchLastMessage(client, chatId, m.id, { text: before.text, editedAt: before.editedAt });
          }
          fail(err, "Не удалось изменить сообщение");
          return;
        }
        reconcile();
      },

      async remove(m: Message, forEveryone: boolean) {
        const before = historyCache.find(client, chatId, m.id);
        historyCache.remove(client, chatId, m.id);
        chatCache.dropLastMessage(client, chatId, m.id, lastSettled(client, chatId));
        try {
          await deleteMessage(chatId, m.id, forEveryone);
        } catch (err) {
          if (before) historyCache.restore(client, chatId, before);
          void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
          fail(err, "Не удалось удалить сообщение");
          return;
        }
        reconcile();
      },

      async react(m: Message, emoji: string) {
        const op = reactOps.get(m.id) ?? { seq: 0, pending: 0 };
        const mySeq = ++op.seq;
        op.pending += 1;
        reactOps.set(m.id, op);
        const before = historyCache.patch(client, chatId, m.id, (x) => ({
          ...x,
          reactions: toggleReaction(reactionsOf(x), emoji, me.id, maxReactionsPerUser(isPremium)),
        }));
        try {
          const { message } = await reactToMessage(chatId, m.id, emoji);
          op.pending -= 1;
          // Сервер мог поправить (лимит реакций) — его версию берём только от последнего нажатия.
          if (op.seq === mySeq && op.pending === 0) historyCache.replace(client, chatId, message);
        } catch (err) {
          op.pending -= 1;
          if (op.seq === mySeq && before) historyCache.patch(client, chatId, m.id, (x) => ({ ...x, reactions: before.reactions }));
          fail(err, "Не удалось поставить реакцию");
        } finally {
          if (op.pending === 0) reactOps.delete(m.id);
        }
      },

      async togglePin(m: Message) {
        const pinned = !m.pinned;
        const before = historyCache.patch(client, chatId, m.id, (x) => ({ ...x, pinned }));
        try {
          const { message } = await pinMessage(chatId, m.id, pinned);
          historyCache.replace(client, chatId, message);
        } catch (err) {
          if (before) historyCache.restore(client, chatId, before);
          fail(err, "Не удалось закрепить сообщение");
          return;
        }
        // В группе появится служебная строка «… закрепил(а) …».
        reconcile();
      },

      /** Переслать в выбранные чаты по очереди; возвращает, сколько не ушло, и последнюю ошибку. */
      async forward(m: Message, targets: readonly string[], origin: ForwardOrigin, hideAuthor: boolean) {
        let failed = 0;
        let lastError: unknown = null;
        for (const target of targets) {
          try {
            const { message } = await forwardMessage(target, m, origin, hideAuthor);
            // message:new сервер шлёт только остальным — своё превью обновляем сами.
            chatCache.noteMessage(client, target, message);
            void client.invalidateQueries({ queryKey: messageQueries.history(target).queryKey });
          } catch (err) {
            failed += 1;
            lastError = err;
          }
        }
        return { failed, lastError };
      },
    };
  }, [client, chatId, me.id, isPremium]);
}

/** Последнее сообщение ленты после удаления — оно встанет в превью списка. */
function lastSettled(client: QueryClient, chatId: string) {
  const messages = client.getQueryData(messageQueries.history(chatId).queryKey)?.messages ?? [];
  return messages.findLast((x) => !x.pending && !x.threadRootId) ?? null;
}
