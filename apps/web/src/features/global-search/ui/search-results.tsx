import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";

import { chatQueries, type ChatSummary, chatTitle, openDm } from "@/entities/chat";
import { communityQueries } from "@/entities/community";
import { openGame } from "@/entities/game";
import { stripCustomEmoji } from "@/entities/message";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, EmojiText, Icon, toast } from "@/shared/ui";

import { searchQueries,type SearchResult } from "../api/search";
import { highlightMatch, searchTimeLabel } from "../lib/highlight";

import styles from "./search.module.css";

type Bucket = "all" | "dms" | "groups" | "channels" | "users" | "bots" | "games" | "messages";

type Props = {
  query: string;
  meId: string;
  /** Свои чаты — найденные показываем строкой списка (с её меню). */
  chats: readonly ChatSummary[];
  renderChat: (chat: ChatSummary) => ReactNode;
  /** Открыли найденное — поиск закрывается. */
  onDone: () => void;
};

type Account = SearchResult["users"][number] | SearchResult["bots"][number];

/** Результаты поиска вместо списка — renderResults в public/js/views/chatList.js. */
export function SearchResults({ query, meId, chats, renderChat, onDone }: Props) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [bucket, setBucket] = useState<Bucket>("all");
  const result = useQuery(searchQueries.all(query));
  const communities = useQuery(communityQueries.joined()).data ?? [];
  const communityChatIds = new Set(communities.flatMap((c) => c.chatIds));
  if (result.isError) return <p className={styles.empty}>{errorText(result.error, "Не удалось найти")}</p>;
  const r = result.data;
  if (!r) return null;

  const matched = new Set(r.chats.map((c) => c.id));
  const mine = chats.filter((c) => matched.has(c.id) && !communityChatIds.has(c.id));
  const dms = mine.filter((c) => c.type === "dm" || c.type === "bot");
  const groups = mine.filter((c) => c.type === "group");
  const myChannels = mine.filter((c) => c.type === "channel");
  const total = mine.length + r.channels.length + r.users.length + r.bots.length + r.games.length + r.messages.length;
  const buckets: { id: Bucket; name: string; count: number }[] = [
    { id: "all" as const, name: "Все", count: total },
    { id: "dms" as const, name: "Личные", count: dms.length },
    { id: "groups" as const, name: "Группы", count: groups.length },
    { id: "channels" as const, name: "Каналы", count: myChannels.length + r.channels.length },
    { id: "users" as const, name: "Люди", count: r.users.length },
    { id: "bots" as const, name: "Боты", count: r.bots.length },
    { id: "games" as const, name: "Игры", count: r.games.length },
    { id: "messages" as const, name: "Сообщения", count: r.messages.length },
  ].filter((b) => b.id === "all" || b.count > 0);
  const active = buckets.some((b) => b.id === bucket) ? bucket : "all";
  const show = (id: Bucket) => active === "all" || active === id;

  const openAccount = async (u: Account) => {
    try {
      const { chat } = await openDm(u.id, u.name, u.avatarColor);
      onDone();
      void navigate(`/chat/${chat.id}`);
      void client.refetchQueries({ queryKey: chatQueries.list().queryKey });
    } catch (err) {
      toast(errorText(err, "Не удалось открыть чат"), { error: true });
    }
  };
  const accountRow = (u: Account) => (
    <button key={u.id} type="button" className={styles.row} data-search-row="" onClick={() => void openAccount(u)}>
      <Avatar size={30} name={u.name} color={u.avatarColor} image={u.avatarImage} />
      <span className={styles.name}>
        <EmojiText text={u.name} />
      </span>
      {u.isVerified ? <Icon name="Verified" size={13} /> : null}
      {u.username ? <span className={styles.muted}>@{u.username}</span> : null}
    </button>
  );
  const section = (title: string, rows: ReactNode[]) =>
    rows.length ? (
      <section key={title} aria-label={title}>
        <p className={styles.label}>{title}</p>
        {rows}
      </section>
    ) : null;

  return (
    <div className={styles.results}>
      {total ? (
        <div className={styles.chips} role="tablist" aria-label="Что искать">
          {buckets.map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={b.id === active} className={b.id === active ? `${styles.chip} ${styles.chipActive}` : styles.chip} onClick={() => setBucket(b.id)}>
              {b.id === "all" ? b.name : `${b.name} ${b.count}`}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Ничего не найдено</p>
      )}
      {show("dms") ? section("Личные", dms.map((c) => <div key={c.id}>{renderChat(c)}</div>)) : null}
      {show("groups") ? section("Группы", groups.map((c) => <div key={c.id}>{renderChat(c)}</div>)) : null}
      {show("channels") ? section("Мои каналы", myChannels.map((c) => <div key={c.id}>{renderChat(c)}</div>)) : null}
      {show("channels")
        ? section(
            "Каналы",
            r.channels.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.row}
                data-search-row=""
                onClick={() => {
                  onDone();
                  void navigate(c.username ? `/u/${c.username}` : "/");
                }}
              >
                <Avatar size={30} name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} />
                <span className={styles.name}>
                  <EmojiText text={c.title ?? ""} />
                </span>
                <span className={styles.muted}>{c.username ? `@${c.username}` : `${c.subscriberCount} подписчиков`}</span>
              </button>
            ))
          )
        : null}
      {show("users") ? section("Люди", r.users.map(accountRow)) : null}
      {show("bots") ? section("Боты", r.bots.map(accountRow)) : null}
      {show("games")
        ? section(
            "Игры",
            r.games.map((g) => (
              <button key={g.id} type="button" className={styles.row} data-search-row="" onClick={() => openGame(g)}>
                <span className={styles.gameEmoji}>{g.emoji || "🎮"}</span>
                <span className={styles.name}>{g.title}</span>
                <span className={styles.muted}>{g.description || ("builtin" in g ? "Встроенная игра" : "Игра")}</span>
              </button>
            ))
          )
        : null}
      {show("messages")
        ? section(
            "Сообщения",
            r.messages.map((m) => {
              const c = chats.find((x) => x.id === m.chatId);
              const title = c ? chatTitle(c) : "Чат";
              const text = stripCustomEmoji(m.text ?? "").replace(/\s+/g, " ");
              const hit = highlightMatch(text, query);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={styles.messageRow}
                  data-search-row=""
                  onClick={() => {
                    onDone();
                    void navigate(`/chat/${m.chatId}?msg=${encodeURIComponent(m.id)}`);
                  }}
                >
                  <Avatar size={40} name={c?.otherUser?.name ?? title} color={c?.otherUser?.avatarColor ?? c?.avatarColor} image={c?.otherUser?.avatarImage ?? c?.avatarImage} />
                  <span className={styles.messageBody}>
                    <span className={styles.messageHead}>
                      <span className={styles.name}>{title}</span>
                      <span className={styles.time}>{searchTimeLabel(m.createdAt)}</span>
                    </span>
                    <span className={styles.messageText}>
                      {m.senderId === meId ? "Вы: " : ""}
                      {hit ? (
                        <>
                          {hit.head}
                          <mark className={styles.hit}>{hit.hit}</mark>
                          {hit.tail}
                        </>
                      ) : (
                        text
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )
        : null}
    </div>
  );
}
