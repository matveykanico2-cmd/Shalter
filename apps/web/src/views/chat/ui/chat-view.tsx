import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { useParams } from "react-router";

import { ChatHeader } from "@/widgets/chat-header";
import { MessageFeed, type MessageFeedHandle } from "@/widgets/message-feed";

import { useMessageActions } from "@/features/message-actions";
import { Composer, type ComposerHandle } from "@/features/send-message";

import { type ChatMember, type ChatSummary, chatTitle, isChatAdmin, useChatCard, useChatFromList } from "@/entities/chat";
import type { Message } from "@/entities/message";
import { type SelfUser, useSession } from "@/entities/session";

import styles from "./chat-view.module.css";

const NO_MEMBERS: ChatMember[] = [];

/** Открытый чат: шапка, лента, поле ввода. */
export function ChatView() {
  const { chatId = "" } = useParams();
  const me = useSession().data?.user;
  const listed = useChatFromList(chatId);
  const card = useChatCard(chatId);
  // Пока карточка грузится, чат берём из списка — экран открывается сразу.
  const chat = card.data?.chat ?? listed.data ?? null;

  if (!me) return null;
  if (!chat) {
    if (listed.isPending || card.isPending) return null;
    return <div className={styles.missing}>Чат не найден</div>;
  }
  // key: новый чат — новое состояние ленты и поля ввода (ответ, плашка непрочитанных).
  return <OpenChat key={chat.id} chat={chat} members={card.data?.members ?? NO_MEMBERS} me={me} />;
}

function OpenChat({ chat, members, me }: { chat: ChatSummary; members: readonly ChatMember[]; me: SelfUser }) {
  const feed = useRef<MessageFeedHandle>(null);
  const composer = useRef<ComposerHandle>(null);
  const drop = useFileDrop((files) => composer.current?.attach(files));
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const actions = useMessageActions(chat, me);
  const title = chatTitle(chat);
  const reply = (m: Message, quote?: string) => {
    // Правка уступает место ответу. Цитату во время правки не вставляем: поле вернёт набранное до неё.
    const wasEditing = !!editing;
    setEditing(null);
    setReplyTo(m);
    if (quote && !wasEditing) composer.current?.quote(quote);
  };
  const edit = (m: Message) => {
    setReplyTo(null);
    setEditing(m);
  };
  const senderName = (m: Message) => (m.anonymous ? title : m.senderId === me.id ? me.name : (members.find((u) => u.id === m.senderId) ?? chat.otherUser)?.name ?? null);

  return (
    <section className={drop.active ? `${styles.view} ${styles.dropActive}` : styles.view} aria-label={title} {...drop.handlers}>
      <ChatHeader chat={chat} members={members} meId={me.id} />
      <div className={styles.body}>
        <MessageFeed ref={feed} chat={chat} members={members} me={me} onReply={reply} onEdit={edit} />
        <Bottom
          chat={chat}
          me={me}
          composer={
            <Composer
              ref={composer}
              chatId={chat.id}
              meId={me.id}
              channel={chat.type === "channel"}
              initialDraft={typeof chat.draft === "string" ? chat.draft : ""}
              replyTo={replyTo}
              replyToName={replyTo ? senderName(replyTo) : null}
              onCancelReply={() => setReplyTo(null)}
              onSent={() => feed.current?.stickToBottom()}
              editing={editing}
              onSaveEdit={(m, text) => void actions.edit(m, text)}
              onCancelEdit={() => setEditing(null)}
              onEditLast={() => {
                const last = feed.current?.lastEditable();
                if (last) edit(last);
              }}
            />
          }
        />
      </div>
    </section>
  );
}

/** Поле ввода — или почему писать нельзя (как buildComposer в public/js/views/chatView.js). */
function Bottom({ chat, me, composer }: { chat: ChatSummary; me: SelfUser; composer: ReactNode }) {
  if (chat.otherUser && me.blockedUserIds?.includes(chat.otherUser.id)) return <p className={styles.hint}>Вы заблокировали этого пользователя</p>;
  // Подписка и отписка от канала появятся вместе с его экраном.
  if (chat.type === "channel" && !isChatAdmin(chat, me.id)) return null;
  if (chat.otherUser?.isServiceBot) return <p className={styles.hint}>Shalter — служебный чат: сюда приходят коды входа и уведомления, отвечать в нём нельзя</p>;
  const restrictedUntil = chat.restrictions?.[me.id];
  if (typeof restrictedUntil === "string") {
    if (restrictedUntil === "forever") return <p className={styles.hint}>Вам запрещено писать в этом чате</p>;
    if (restrictedUntil > new Date().toISOString()) {
      return <p className={styles.hint}>Вам запрещено писать в этом чате до {new Date(restrictedUntil).toLocaleString("ru-RU")}</p>;
    }
  }
  return composer;
}

const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");

/** Файлы, брошенные на чат, — в окно отправки (как mainCol drop в chatView.js). */
function useFileDrop(onFiles: (files: File[]) => void) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  return {
    active,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current++;
        setActive(true);
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setActive(false);
      },
      onDrop: (e: DragEvent) => {
        depth.current = 0;
        setActive(false);
        const files = [...(e.dataTransfer?.files ?? [])];
        if (!files.length) return;
        e.preventDefault();
        onFiles(files);
      },
    },
  };
}
