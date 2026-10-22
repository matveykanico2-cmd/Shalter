import { Link, useParams } from "react-router";

import { chatTitle, useChatFromList } from "@/entities/chat";

import { Avatar, Icon } from "@/shared/ui";

import styles from "./chat-view.module.css";

/** Открытый чат. Пока только шапка: переписка — следующий шаг этапа 4. */
export function ChatView() {
  const { chatId } = useParams();
  const { data: chat, isPending } = useChatFromList(chatId);

  if (isPending) return null;
  if (!chat) return <div className={styles.missing}>Чат не найден</div>;

  const title = chatTitle(chat);
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
    </section>
  );
}
