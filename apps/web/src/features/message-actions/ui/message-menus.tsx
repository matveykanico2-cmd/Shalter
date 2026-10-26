import { type ChatSummary } from "@/entities/chat";
import { type Message, reactionLabel, reactionsOf } from "@/entities/message";
import type { SelfUser } from "@/entities/session";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { publicUrl } from "@/shared/lib/public-link";
import { Menu, type MenuItem, toast } from "@/shared/ui";

import { canDelete, canEdit, canPin, canReact, canSummarize, canTranslate, deleteOptions, isProtectedChat } from "../lib/permissions";
import { readAtLabel } from "../lib/read-at";
import type { DmTarget, useMessageActions } from "../model/use-message-actions";
import type { MessageMenuControl } from "../model/use-message-menu";
import type { Summaries } from "../model/use-summaries";

import { DeleteMessageDialog } from "./delete-message-dialog";
import { ForwardDialog } from "./forward-dialog";
import { ReactionsBar } from "./reactions-bar";
import { ReadersMenu } from "./readers-menu";
import { ReportDialog } from "./report-dialog";
import { SelectTextDialog } from "./select-text-dialog";
import { TranslateDialog } from "./translate-dialog";

type Props = {
  control: MessageMenuControl;
  actions: ReturnType<typeof useMessageActions>;
  chat: ChatSummary;
  me: SelfUser;
  /** Имя автора — для подписи «Переслано от …». */
  senderName: (m: Message) => string | null;
  /** Автор — для «Ответить лично» (боту и анонимному админу лично не ответить). */
  author?: (m: Message) => (DmTarget & { isBot?: boolean }) | null;
  onReply?: (m: Message, quote?: string) => void;
  onEdit?: (m: Message) => void;
  /** Имя участника по id; неизвестных в «кто поставил» не показываем. */
  nameOf?: (userId: string) => string | null;
  /** Начать выбор нескольких с этого сообщения. */
  onSelect?: (m: Message) => void;
  summaries?: Summaries;
};

/** Меню сообщения и его диалоги — как openMessageMenu в public/js/components/messageBubble.js. */
export function MessageMenus({ control, actions, chat, me, senderName, author, nameOf, onReply, onEdit, onSelect, summaries }: Props) {
  const { state, close } = control;
  if (!state) return null;

  if (state.kind === "reactions") {
    const m = state.message;
    if (!canReact(chat, m)) return null;
    return (
      <Menu
        at={state.at}
        wide
        label="Реакции"
        onClose={close}
        header={
          <ReactionsBar
            chat={chat}
            message={m}
            meId={me.id}
            isPremium={!!me.isPremium}
            onReact={(emoji) => {
              close();
              void actions.react(m, emoji);
            }}
            onLocked={() => {
              close();
              // Экран Premium переедет вместе с настройками.
              toast("Реакция для Premium");
            }}
          />
        }
      />
    );
  }

  // Кто поставил реакцию — как showReactionDetails в messageBubble.js.
  if (state.kind === "reactors") {
    const m = state.message;
    const r = reactionsOf(m).find((x) => x.emoji === state.emoji);
    if (!r) return null;
    const names = r.userIds.map((id) => nameOf?.(id)).filter((n): n is string => !!n);
    const items: MenuItem[] = [{ label: `${reactionLabel(r.emoji)} — ${r.userIds.length}` }, ...names.map((name) => ({ icon: "User" as const, label: name }))];
    return <Menu at={state.at} label="Реакции" items={items} onClose={close} />;
  }

  if (state.kind === "translate") return <TranslateDialog text={state.text} onClose={close} />;
  if (state.kind === "selectText") return <SelectTextDialog text={state.text} onClose={close} />;

  const m = state.message;

  if (state.kind === "report") return <ReportDialog messageId={m.id} targetLabel={state.label} onClose={close} />;

  if (state.kind === "readers") {
    const fallback = readersOf(m, me.id).flatMap((id) => {
      const name = nameOf?.(id);
      return name ? [{ id, name, readAt: null }] : [];
    });
    return <ReadersMenu message={m} fallback={fallback} at={state.at} onClose={close} />;
  }

  if (state.kind === "delete") {
    return <DeleteMessageDialog {...deleteOptions(chat, m, me)} onDelete={(forEveryone) => void actions.remove(m, forEveryone)} onClose={close} />;
  }

  if (state.kind === "forward") {
    const origin = { chatId: chat.id, chatTitle: (chat.type === "dm" ? chat.otherUser?.name : null) ?? chat.title ?? "", senderName: senderName(m) ?? "Аноним" };
    return (
      <ForwardDialog
        onClose={close}
        onSend={async (ids, hideAuthor) => {
          const { failed, lastError } = await actions.forward(m, ids, origin, hideAuthor);
          if (failed) toast(`${errorText(lastError, "Не удалось отправить")}${ids.length > 1 ? ` (не ушло в ${failed} из ${ids.length})` : ""}`, { error: true });
        }}
      />
    );
  }

  const isDm = chat.type === "dm";
  const isChannel = chat.type === "channel";
  const mine = m.senderId === me.id;
  const isGift = m.type === "gift";
  const protectedContent = isProtectedChat(chat);
  const quote = state.quote;
  const items: MenuItem[] = [];
  if (onReply) items.push({ icon: "Reply", label: "Ответить", onClick: () => onReply(m, quote) });
  if (canPin(chat, me.id)) items.push({ icon: "Pin", label: m.pinned ? "Открепить" : "Закрепить", onClick: () => void actions.togglePin(m) });
  if (!protectedContent) items.push({ icon: "Forward", label: "Переслать", onClick: () => control.open({ kind: "forward", message: m }) });
  if (m.text?.trim() && !protectedContent) {
    items.push({ icon: "Copy", label: "Копировать текст", onClick: () => void copyText(m.text ?? "", "Текст скопирован") });
    // На телефоне долгое нажатие открывает меню, а не выделение — часть текста выделяют в окне.
    items.push({ icon: "Edit", label: "Выделить текст", onClick: () => control.open({ kind: "selectText", text: m.text ?? "" }) });
  }
  // Ссылка на сообщение (не в личке) открывает чат и прокручивает к нему; публичный — через @ник.
  if (!isDm && !protectedContent) {
    const path = chat.username ? `/u/${chat.username}` : `/chat/${chat.id}`;
    items.push({ icon: "Link", label: "Копировать ссылку", onClick: () => void copyText(`${publicUrl(path)}?msg=${m.id}`, "Ссылка скопирована") });
  }
  if (onSelect && !isGift) items.push({ icon: "Check", label: "Выбрать", onClick: () => onSelect(m) });
  const readers = !isDm && !isChannel && mine ? readersOf(m, me.id) : [];
  if (readers.length) items.push({ icon: "CheckCheck", label: `Прочитали: ${readers.length}`, onClick: () => control.open({ kind: "readers", message: m, at: state.at }) });
  if (isDm && mine && m.readAt) items.push({ icon: "CheckCheck", label: readAtLabel(m.readAt) });
  // «Ответить лично» — как в Telegram: личка с автором, сообщение в черновике цитатой.
  const target = !isDm && !isChannel && !mine && !m.anonymous ? author?.(m) : null;
  if (target && !target.isBot) items.push({ icon: "User", label: "Ответить лично", onClick: () => void actions.replyPrivately(m, target, quote) });
  if (canTranslate(m)) items.push({ icon: "Globe", label: "Перевести", onClick: () => control.open({ kind: "translate", text: m.text ?? "" }) });
  if (summaries && canSummarize(m, protectedContent)) {
    items.push({ icon: "Zap", label: summaries.has(m.id) ? "Скрыть сводку" : "Кратко", onClick: () => void summaries.toggle(m) });
  }
  // За звёзды — чужое в личке, у обоих (своё удаляется бесплатно).
  if (isDm && !mine && !isGift) items.push({ icon: "Trash", label: "Удалить за звёзды", danger: true, onClick: () => void actions.paidDelete(m) });
  if (onEdit && canEdit(m, me.id)) items.push({ icon: "Edit", label: "Изменить", onClick: () => onEdit(m) });
  else if (!mine) {
    const name = senderName(m);
    items.push({ icon: "Info", label: "Пожаловаться", danger: true, onClick: () => control.open({ kind: "report", message: m, label: name ? `сообщение от ${name}` : "сообщение" }) });
  }
  if (canDelete(m)) items.push({ icon: "Trash", label: "Удалить", danger: true, onClick: () => control.open({ kind: "delete", message: m }) });

  return <Menu at={state.at} label="Действия с сообщением" items={items} onClose={close} />;
}

/** Кто прочитал своё сообщение в группе (кроме себя). */
const readersOf = (m: Message, meId: string) => (m.readByIds ?? []).filter((id) => id !== meId);
