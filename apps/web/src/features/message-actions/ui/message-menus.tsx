import { type ChatSummary } from "@/entities/chat";
import type { Message } from "@/entities/message";
import type { SelfUser } from "@/entities/session";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { publicUrl } from "@/shared/lib/public-link";
import { Menu, type MenuItem, toast } from "@/shared/ui";

import { canDelete, canEdit, canPin, canReact, deleteOptions, isProtectedChat } from "../lib/permissions";
import { readAtLabel } from "../lib/read-at";
import type { useMessageActions } from "../model/use-message-actions";
import type { MessageMenuControl } from "../model/use-message-menu";

import { DeleteMessageDialog } from "./delete-message-dialog";
import { ForwardDialog } from "./forward-dialog";
import { ReactionStrip } from "./reaction-strip";

type Props = {
  control: MessageMenuControl;
  actions: ReturnType<typeof useMessageActions>;
  chat: ChatSummary;
  me: SelfUser;
  /** Имя автора — для подписи «Переслано от …». */
  senderName: (m: Message) => string | null;
  onReply?: (m: Message) => void;
  onEdit?: (m: Message) => void;
};

/** Меню сообщения и его диалоги — как openMessageMenu в public/js/components/messageBubble.js. */
export function MessageMenus({ control, actions, chat, me, senderName, onReply, onEdit }: Props) {
  const { state, close } = control;
  if (!state) return null;
  const m = state.message;

  if (state.kind === "reactions") {
    if (!canReact(chat, m)) return null;
    return (
      <Menu
        at={state.at}
        label="Реакции"
        onClose={close}
        header={
          <ReactionStrip
          chat={chat}
          message={m}
          meId={me.id}
          isPremium={!!me.isPremium}
          onReact={(emoji) => {
            close();
            void actions.react(m, emoji);
          }}
          />
        }
      />
    );
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
  const mine = m.senderId === me.id;
  const protectedContent = isProtectedChat(chat);
  const items: MenuItem[] = [];
  if (onReply) items.push({ icon: "Reply", label: "Ответить", onClick: () => onReply(m) });
  if (canPin(chat, me.id)) items.push({ icon: "Pin", label: m.pinned ? "Открепить" : "Закрепить", onClick: () => void actions.togglePin(m) });
  if (!protectedContent) items.push({ icon: "Forward", label: "Переслать", onClick: () => control.openForward(m) });
  if (m.text?.trim() && !protectedContent) items.push({ icon: "Copy", label: "Копировать текст", onClick: () => void copyText(m.text ?? "", "Текст скопирован") });
  // Ссылка на сообщение (не в личке) открывает чат и прокручивает к нему; публичный — через @ник.
  if (!isDm && !protectedContent) {
    const path = chat.username ? `/u/${chat.username}` : `/chat/${chat.id}`;
    items.push({ icon: "Link", label: "Копировать ссылку", onClick: () => void copyText(`${publicUrl(path)}?msg=${m.id}`, "Ссылка скопирована") });
  }
  if (isDm && mine && m.readAt) items.push({ icon: "CheckCheck", label: readAtLabel(m.readAt) });
  if (onEdit && canEdit(m, me.id)) items.push({ icon: "Edit", label: "Изменить", onClick: () => onEdit(m) });
  if (canDelete(m)) items.push({ icon: "Trash", label: "Удалить", danger: true, onClick: () => control.openDelete(m) });

  return <Menu at={state.at} label="Действия с сообщением" items={items} onClose={close} />;
}
