import { useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { ChatSummary } from "@/entities/chat";
import type { TopicFilter } from "@/entities/message";
import { type Topic, topicQueries } from "@/entities/topic";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Icon, Menu, type MenuItem, toast } from "@/shared/ui";

import { deleteTopic, updateTopic } from "../api/topics";
import { canCreateTopics, isTopicStaff } from "../lib/permissions";

import { TopicDialog } from "./topic-dialog";
import styles from "./topics.module.css";

type Props = {
  chat: ChatSummary;
  meId: string;
  topics: readonly Topic[];
  /** undefined — «Все», "general" — «Общее», иначе id темы. */
  active: TopicFilter;
  onSelect: (topic: TopicFilter) => void;
};

/** Вкладки тем над перепиской группы — как TopicTabs в public/js/components/topicTabs.js. */
export function TopicTabs({ chat, meId, topics, active, onSelect }: Props) {
  const client = useQueryClient();
  const bar = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ topic: Topic; at: { x: number; y: number } } | null>(null);
  const [dialog, setDialog] = useState<{ topic: Topic | null } | null>(null);
  const staff = isTopicStaff(chat, meId);
  const changed = () => void client.invalidateQueries({ queryKey: topicQueries.list(chat.id).queryKey });

  // Активная вкладка — в зоне видимости.
  useEffect(() => {
    bar.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);

  const sorted = [...topics].sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));

  const menuItems = (topic: Topic): MenuItem[] => {
    const items: MenuItem[] = [];
    if (staff || topic.createdBy === meId) items.push({ icon: "Edit", label: "Изменить", onClick: () => setDialog({ topic }) });
    if (staff) {
      items.push({
        icon: topic.closed ? "Check" : "Lock",
        label: topic.closed ? "Открыть тему" : "Закрыть тему",
        onClick: () => void updateTopic(chat.id, topic.id, { closed: !topic.closed }).then(changed, (err: unknown) => toast(errorText(err), { error: true })),
      });
      items.push({
        icon: "Trash",
        label: "Удалить тему",
        danger: true,
        onClick: async () => {
          if (!(await askConfirm(`Удалить тему «${topic.title}» вместе со всеми сообщениями?`, { okLabel: "Удалить", danger: true }))) return;
          try {
            await deleteTopic(chat.id, topic.id);
            if (active === topic.id) onSelect(undefined);
            changed();
          } catch (err) {
            toast(errorText(err), { error: true });
          }
        },
      });
    }
    return items;
  };

  const tab = (id: TopicFilter, label: string, extra: { icon?: string; color?: string; closed?: boolean; topic?: Topic } = {}) => (
    <button
      key={id ?? "all"}
      type="button"
      role="tab"
      aria-selected={active === id}
      className={[styles.tab, active === id ? styles.active : "", extra.closed ? styles.closed : ""].filter(Boolean).join(" ")}
      style={extra.color ? ({ "--topic-color": extra.color } as CSSProperties) : undefined}
      onClick={() => onSelect(id)}
      onContextMenu={(e) => {
        const topic = extra.topic;
        if (!topic || !menuItems(topic).length) return;
        e.preventDefault();
        setMenu({ topic, at: { x: e.clientX, y: e.clientY } });
      }}
    >
      {extra.icon ? <span className={styles.tabIcon}>{extra.icon}</span> : extra.color ? <span className={styles.dot} /> : null}
      <span className={styles.label}>{label}</span>
      {extra.closed ? (
        <span className={styles.lock} aria-label="Закрыта">
          <Icon name="Lock" size={11} />
        </span>
      ) : null}
    </button>
  );

  return (
    <div ref={bar} className={styles.tabs} role="tablist" aria-label="Темы">
      {tab(undefined, "Все")}
      {tab("general", "Общее", { icon: "#" })}
      {sorted.map((t) => tab(t.id, t.title, { icon: t.icon, color: t.color, closed: t.closed, topic: t }))}
      {canCreateTopics(chat, meId) ? (
        <button type="button" className={`${styles.tab} ${styles.add}`} title="Новая тема" onClick={() => setDialog({ topic: null })}>
          <Icon name="Plus" size={14} />
        </button>
      ) : null}
      {menu ? <Menu at={menu.at} label="Тема" items={menuItems(menu.topic)} onClose={() => setMenu(null)} /> : null}
      {dialog ? (
        <TopicDialog
          chatId={chat.id}
          topic={dialog.topic}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            changed();
            if (!dialog.topic) onSelect(id);
          }}
        />
      ) : null}
    </div>
  );
}
