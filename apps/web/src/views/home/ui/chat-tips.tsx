import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { chatQueries, type ChatSummary, chatTitle } from "@/entities/chat";
import { settingsQueries, useUpdateSettings } from "@/entities/settings";

import { Avatar, Icon, type IconName } from "@/shared/ui";

import styles from "./chat-tips.module.css";

// Пустая колонка чата, как в tweb (components/chatTips) и public/js/components/chatTips.js:
// карточки-подсказки с настоящими переключателями, под ними «назад / далее». Кнопка в углу
// сворачивает колоду в плашку «Выберите чат, чтобы начать общение».

const FOLDED_KEY = "shalter.chatTips.folded";
const INDEX_KEY = "shalter.chatTips.index";
const ACCENTS = ["", "#3390EC", "#E53935", "#4FAE4E", "#E39D2B", "#8774E1", "#00A99D", "#E0507A"];
// Прежнее значение по умолчанию — это «как в теме» (isThemeAccent в public/js/lib/accent.js).
const OLD_DEFAULT_ACCENT = "#2E56D9";

const readLS = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeLS = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Хранилище недоступно — выбор доживёт до перезагрузки.
  }
};

type TipButton = { icon: IconName; text: string; selected: boolean; onClick: () => void };

function TipCard({ title, buttons, contentTitle, content, description }: { title: string; buttons: TipButton[]; contentTitle?: string; content: React.ReactNode; description: React.ReactNode }) {
  return (
    <div className={styles.card}>
      <p className={styles.title}>{title}</p>
      <div className={styles.buttons}>
        {buttons.map((b) => (
          <button key={b.text} type="button" aria-pressed={b.selected} className={b.selected ? `${styles.button} ${styles.selected}` : styles.button} onClick={b.onClick}>
            <Icon name={b.icon} size={16} />
            <span className={styles.buttonText}>{b.text}</span>
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {contentTitle && <p className={styles.contentTitle}>{contentTitle}</p>}
        {content}
      </div>
      <p className={styles.description}>{description}</p>
    </div>
  );
}

function AppearanceCard() {
  const settings = useQuery({ ...settingsQueries.current(), enabled: false }).data;
  const update = useUpdateSettings();
  const theme = settings?.theme ?? "system";
  const accent = settings?.accent;
  const themeAccent = !accent || accent.toUpperCase() === OLD_DEFAULT_ACCENT;
  return (
    <TipCard
      title="Оформление"
      buttons={[
        { icon: "Monitor", text: "Авто", selected: theme === "system", onClick: () => update.mutate({ theme: "system" }) },
        { icon: "Moon", text: "Тёмная", selected: theme === "dark", onClick: () => update.mutate({ theme: "dark" }) },
        { icon: "Sun", text: "Светлая", selected: theme === "light", onClick: () => update.mutate({ theme: "light" }) },
      ]}
      contentTitle="Цвет акцента"
      content={
        <div className={styles.accents}>
          {ACCENTS.map((hex) => (
            <button
              key={hex || "theme"}
              type="button"
              aria-label={hex || "Как в теме"}
              aria-pressed={hex ? accent === hex : themeAccent}
              className={(hex ? accent === hex : themeAccent) ? `${styles.accent} ${styles.accentSelected}` : styles.accent}
              title={hex || "Как в теме"}
              style={{ background: hex || "linear-gradient(135deg, #3390ec 50%, #8774e1 50%)" }}
              onClick={() => update.mutate({ accent: hex })}
            />
          ))}
        </div>
      }
      description={
        <>
          Это и многое другое меняется в <Link to="/settings/appearance">Настройки › Внешний вид</Link>.
        </>
      }
    />
  );
}

const FILTERS: { id: "recent" | "people" | "unread"; icon: IconName; text: string }[] = [
  { id: "recent", icon: "Clock", text: "Недавние" },
  { id: "people", icon: "User", text: "Люди" },
  { id: "unread", icon: "MessageCircle", text: "Новые" },
];

const byTime = (a: ChatSummary, b: ChatSummary) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? "");

function ChatsCard({ filter, onFilter }: { filter: string; onFilter: (id: string) => void }) {
  const navigate = useNavigate();
  const chats = useQuery({ ...chatQueries.list(), enabled: false }).data ?? [];
  const visible = chats.filter((c) => !c.archived && !c.isSaved);
  const lists = {
    recent: [...visible].sort(byTime),
    unread: visible.filter((c) => (c.unreadCount ?? 0) > 0 || c.unread || c.hasUnreadMention).sort(byTime),
    people: visible.filter((c) => c.type === "dm").sort(byTime),
  };
  const current = FILTERS.find((f) => f.id === filter && lists[f.id].length)?.id ?? FILTERS.find((f) => lists[f.id].length)?.id ?? "recent";
  const peers = lists[current].slice(0, 8);
  return (
    <TipCard
      title="Чаты"
      buttons={FILTERS.map((f) => ({ icon: f.icon, text: f.text, selected: current === f.id, onClick: () => onFilter(f.id) }))}
      content={
        peers.length ? (
          <div className={styles.peers}>
            {peers.map((c) => {
              const name = chatTitle(c);
              return (
                <button key={c.id} type="button" className={styles.peer} title={name} onClick={() => void navigate(`/chat/${c.id}`)}>
                  <Avatar
                    name={name}
                    color={c.otherUser?.avatarColor ?? c.avatarColor}
                    image={c.otherUser?.avatarImage ?? c.avatarImage}
                    size={54}
                    online={c.type === "dm" && !!c.otherUser?.online}
                  />
                  <span className={styles.peerName}>{name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className={styles.emptyText}>Здесь пока пусто.</p>
        )
      }
      description={
        <>
          <b>Ctrl+K</b> — быстрый переход к любому чату.
        </>
      }
    />
  );
}

const CARD_COUNT = 2;

export function ChatTips() {
  const [folded, setFolded] = useState(() => readLS(FOLDED_KEY, "0") === "1");
  const [index, setIndex] = useState(() => Math.min(CARD_COUNT - 1, Math.max(0, Number(readLS(INDEX_KEY, "0")) || 0)));
  const [filter, setFilter] = useState("recent");
  const step = (d: number) => {
    const next = (index + d + CARD_COUNT) % CARD_COUNT;
    setIndex(next);
    writeLS(INDEX_KEY, String(next));
  };
  const cards = [<AppearanceCard key="appearance" />, <ChatsCard key="chats" filter={filter} onFilter={setFilter} />];
  return (
    <div className={styles.tips}>
      <button
        type="button"
        className={styles.toggle}
        title={folded ? "Показать советы" : "Скрыть советы"}
        aria-label={folded ? "Показать советы" : "Скрыть советы"}
        onClick={() => {
          setFolded(!folded);
          writeLS(FOLDED_KEY, folded ? "0" : "1");
        }}
      >
        <Icon name={folded ? "Info" : "X"} size={20} />
      </button>
      <div className={folded ? `${styles.deck} ${styles.hidden}` : styles.deck}>
        <div className={styles.stage}>
          {cards.map((card, i) => (
            <div
              key={i}
              className={i === index ? `${styles.slot} ${styles.active}` : styles.slot}
              style={{ "--tip-slide": `${(i - index) * 50}px` } as React.CSSProperties}
              // Соседняя карточка невидима — и для скринридера, и для поиска по ролям.
              inert={i !== index}
              aria-hidden={i !== index}
            >
              {card}
            </div>
          ))}
        </div>
        <div className={styles.nav}>
          <button type="button" className={styles.navButton} onClick={() => step(-1)}>
            <Icon name="ChevronLeft" size={16} />
            Предыдущий совет
          </button>
          <button type="button" className={styles.navButton} onClick={() => step(1)}>
            Следующий совет
            <Icon name="ChevronRight" size={16} />
          </button>
        </div>
      </div>
      <div className={folded ? `${styles.select} ${styles.shown}` : styles.select}>
        <span className={styles.pill}>Выберите чат, чтобы начать общение</span>
      </div>
    </div>
  );
}
