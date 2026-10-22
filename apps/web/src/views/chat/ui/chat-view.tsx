import { type ReactNode, useRef, useState } from "react";
import { Link, useParams } from "react-router";

import { MessageFeed, type MessageFeedHandle } from "@/widgets/message-feed";

import { Composer } from "@/features/send-message";

import { type ChatMember, type ChatSummary, chatTitle, isChatAdmin, useChatCard, useChatFromList } from "@/entities/chat";
import type { Message } from "@/entities/message";
import { type SelfUser, useSession } from "@/entities/session";

import { Avatar, Icon } from "@/shared/ui";

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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const title = chatTitle(chat);
  const senderName = (m: Message) => (m.anonymous ? title : m.senderId === me.id ? me.name : (members.find((u) => u.id === m.senderId) ?? chat.otherUser)?.name ?? null);

  return (
    <section className={styles.view} aria-label={title}>
      <header className={styles.header}>
        <Link to="/" className={styles.back} title="Назад к чатам">
          <Icon name="ChevronLeft" size={22} />
        </Link>
        {chat.isSaved ? (
          <span className={styles.saved}>
            <Icon name="Bookmark" size={20} />
          </span>
        ) : (
          <Avatar
            size={40}
            name={chat.otherUser?.name ?? title}
            color={chat.otherUser?.avatarColor ?? chat.avatarColor}
            image={chat.otherUser?.avatarImage ?? chat.avatarImage}
          />
        )}
        <h1 className={styles.title}>{title}</h1>
      </header>
      <div className={styles.body}>
        <MessageFeed ref={feed} chat={chat} members={members} meId={me.id} onReply={setReplyTo} />
        <Bottom
          chat={chat}
          me={me}
          composer={
            <Composer
              chatId={chat.id}
              meId={me.id}
              channel={chat.type === "channel"}
              initialDraft={typeof chat.draft === "string" ? chat.draft : ""}
              replyTo={replyTo}
              replyToName={replyTo ? senderName(replyTo) : null}
              onCancelReply={() => setReplyTo(null)}
              onSent={() => feed.current?.stickToBottom()}
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
