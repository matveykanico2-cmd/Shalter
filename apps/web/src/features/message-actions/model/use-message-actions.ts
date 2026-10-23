// Действия с сообщением — оптимистичные, как в public/js/views/chatView.js: лента меняется
// сразу, запрос идёт в фоне, отказ сервера откатывает правку и показывает его текст.
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { chatCache, chatQueries, type ChatSummary } from "@/entities/chat";
import {
  applyVote,
  type ChecklistMeta,
  historyCache,
  maxReactionsPerUser,
  type Message,
  messageQueries,
  paidMediaQuery,
  type PaidMediaState,
  type PollMeta,
  reactionsOf,
  toggleChecklistItem,
  toggleReaction,
  withAttachmentMeta,
} from "@/entities/message";
import type { SelfUser } from "@/entities/session";

import { ApiError } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { askConfirm, toast } from "@/shared/ui";

import {
  closePoll,
  deleteMessage,
  editMessage,
  forwardMessage,
  type ForwardOrigin,
  pinMessage,
  reactToMessage,
  retractVote,
  unlockPaidMedia,
  updateChecklist,
  votePoll,
} from "../api/message-actions";

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
    const applyServer = async (request: Promise<{ message: Message }>, fallback: string) => {
      try {
        const { message } = await request;
        historyCache.replace(client, chatId, message);
      } catch (err) {
        fail(err, fallback);
        reconcile();
      }
    };

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

      // Опрос и чек-лист — как handleVote/handlePollAction в chatView.js и run() чек-листа:
      // своё сразу, ответ сервера поверх, при ошибке — сверка с сервером.
      async vote(m: Message, optionIndex: number) {
        historyCache.patch(client, chatId, m.id, (x) => withAttachmentMeta(x, "poll", (meta: PollMeta) => applyVote(meta, optionIndex, me.id)));
        await applyServer(votePoll(chatId, m.id, optionIndex), "Не удалось проголосовать");
      },

      async retractVote(m: Message) {
        historyCache.patch(client, chatId, m.id, (x) => withAttachmentMeta(x, "poll", (meta: PollMeta) => applyVote(meta, null, me.id)));
        await applyServer(retractVote(chatId, m.id), "Не удалось отменить голос");
      },

      async closePoll(m: Message) {
        historyCache.patch(client, chatId, m.id, (x) => withAttachmentMeta(x, "poll", (meta: PollMeta) => ({ ...meta, closed: true })));
        await applyServer(closePoll(chatId, m.id), "Не удалось остановить опрос");
      },

      async toggleChecklist(m: Message, itemId: number) {
        historyCache.patch(client, chatId, m.id, (x) => withAttachmentMeta(x, "checklist", (meta: ChecklistMeta) => toggleChecklistItem(meta, itemId, me.id)));
        await applyServer(updateChecklist(chatId, m.id, { itemId }), "Не удалось изменить чек-лист");
      },

      async addChecklistItems(m: Message, texts: string[]) {
        await applyServer(updateChecklist(chatId, m.id, { add: texts }), "Не удалось изменить чек-лист");
      },

      /** Платный пост: подтверждение, звёзды, содержимое — в кэш (paidMedia.js). */
      async unlockPaid(m: Message, { stars, label }: { stars: number; label: string }) {
        const ok = await askConfirm(`Открыть ${label.toLowerCase()} за ${stars} ⭐? Звёзды получит автор канала.`, { okLabel: `Открыть за ${stars} ⭐` });
        if (!ok) return;
        try {
          const { attachments } = await unlockPaidMedia(chatId, m.id);
          const open: PaidMediaState = { attachments };
          client.setQueryData(paidMediaQuery(chatId, m.id).queryKey, open);
          toast("Пост открыт");
        } catch (err) {
          // Пополнение звёзд переедет вместе с его окном; пока — что не хватает.
          if (err instanceof ApiError && err.status === 402) toast(err.message || "Не хватает звёзд", { error: true });
          else fail(err, "Не удалось открыть пост");
        }
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
