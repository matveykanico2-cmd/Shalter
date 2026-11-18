import { useState } from "react";

import { type ChatSummary } from "@/entities/chat";
import { type Attachment, attachmentsOf, isVisualMedia, type Message, type MessageSender, reactionLabel, reactionsOf } from "@/entities/message";
import { ReportDialog } from "@/entities/report";
import type { SelfUser } from "@/entities/session";
import { openUserProfile } from "@/entities/user";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { publicUrl } from "@/shared/lib/public-link";
import { askConfirm, Avatar, Button, Dialog, Menu, type MenuItem, toast } from "@/shared/ui";

import { canDelete, canEdit, canPin, canReact, canSummarize, canTranslate, deleteOptions, isProtectedChat } from "../lib/permissions";
import { readAtLabel } from "../lib/read-at";
import type { DmTarget, useMessageActions } from "../model/use-message-actions";
import type { MessageMenuControl } from "../model/use-message-menu";
import type { Summaries } from "../model/use-summaries";

import { DeleteMessageDialog } from "./delete-message-dialog";
import { ForwardDialog } from "./forward-dialog";
import styles from "./message-actions.module.css";
import { ReactionsBar } from "./reactions-bar";
import { ReadersMenu } from "./readers-menu";
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
  /** Участник по id — полный список реакций с аватаром и переходом в профиль. */
  userOf?: (userId: string) => MessageSender | null;
  /** Начать выбор нескольких с этого сообщения. */
  onSelect?: (m: Message) => void;
  summaries?: Summaries;
  /** Ветка ответов — в группах. */
  onOpenThread?: (m: Message) => void;
};

/** Меню сообщения и его диалоги — как openMessageMenu в public/js/components/messageBubble.js. */
export function MessageMenus({ control, actions, chat, me, senderName, author, nameOf, userOf, onReply, onEdit, onSelect, summaries, onOpenThread }: Props) {
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
    return (
      <Menu
        at={state.at}
        label="Реакции"
        onClose={close}
        header={
          <div className={styles.reactors}>
            <p className={styles.reactorsTitle}>{reactionLabel(r.emoji)} — {r.userIds.length}</p>
            {r.userIds.map((id) => {
              const user = userOf?.(id);
              const name = user?.name || nameOf?.(id) || "Участник";
              return (
                <button
                  key={id}
                  type="button"
                  className={styles.reactor}
                  aria-label={`Открыть профиль ${name}`}
                  onClick={() => {
                    close();
                    openUserProfile(id);
                  }}
                >
                  <span title={name}>
                    <Avatar size={34} name={name} color={user?.avatarColor} image={user?.avatarImage} emoji={user?.avatarEmoji} />
                  </span>
                  <span>{name}</span>
                </button>
              );
            })}
          </div>
        }
      />
    );
  }

  if (state.kind === "translate") return <TranslateDialog text={state.text} onClose={close} />;
  if (state.kind === "selectText") return <SelectTextDialog text={state.text} onClose={close} />;

  const m = state.message;

  if (state.kind === "report") return <ReportDialog target={{ type: "message", id: m.id }} targetLabel={state.label} onClose={close} />;

  if (state.kind === "readers") {
    const fallback = readersOf(m, me.id).flatMap((id) => {
      const name = nameOf?.(id);
      return name ? [{ id, name, readAt: null }] : [];
    });
    return <ReadersMenu message={m} fallback={fallback} at={state.at} onClose={close} />;
  }

  if (state.kind === "delete") {
    const media = attachmentsOf(m).flatMap((attachment, index) => (isVisualMedia(attachment) ? [{ attachment, index }] : []));
    if (media.length > 1 && m.senderId === me.id) {
      return (
        <MediaDeleteDialog
          media={media}
          onClose={close}
          onDelete={(indexes) => {
            close();
            if (indexes.length === media.length) {
              void askConfirm("Удалить всё сообщение с фотографиями?", { okLabel: "Удалить", danger: true }).then((ok) => {
                if (ok) void actions.remove(m, true);
              });
            } else {
              void actions.removeAttachments(m, indexes);
            }
          }}
        />
      );
    }
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
  if (canReact(chat, m)) items.push({ icon: "Smile", label: "Реакции", onClick: () => control.open({ kind: "reactions", message: m, at: state.at }) });
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
  if (onOpenThread && !m.threadRootId) items.push({ icon: "MessageSquare", label: "Ответить в теме", onClick: () => onOpenThread(m) });
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

function MediaDeleteDialog({ media, onDelete, onClose }: { media: readonly { attachment: Attachment; index: number }[]; onDelete: (indexes: number[]) => void; onClose: () => void }) {
  const [selected, setSelected] = useState(() => new Set(media.map((item) => item.index)));
  const toggle = (index: number) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  });
  return (
    <Dialog title="Удалить фотографии" onClose={onClose}>
      <p className={styles.deleteHint}>Выберите фотографии, которые нужно убрать из сообщения.</p>
      <div className={styles.mediaDeleteGrid}>
        {media.map(({ attachment, index }) => (
          <button key={index} type="button" className={selected.has(index) ? `${styles.mediaDeleteItem} ${styles.mediaDeleteSelected}` : styles.mediaDeleteItem} onClick={() => toggle(index)} aria-pressed={selected.has(index)}>
            <img src={attachment.thumbUrl || attachment.url} alt={attachment.name || "Фото"} />
            <span>{selected.has(index) ? "✓" : ""}</span>
          </button>
        ))}
      </div>
      <Button variant="danger" disabled={!selected.size} onClick={() => onDelete([...selected])}>
        Удалить выбранные ({selected.size})
      </Button>
      <Button variant="secondary" onClick={onClose}>Отмена</Button>
    </Dialog>
  );
}

/** Кто прочитал своё сообщение в группе (кроме себя). */
const readersOf = (m: Message, meId: string) => (m.readByIds ?? []).filter((id) => id !== meId);
