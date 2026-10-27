import { useState } from "react";

import type { Topic } from "@/entities/topic";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog } from "@/shared/ui";

import { createTopic, updateTopic } from "../api/topics";

import styles from "./topics.module.css";

const TOPIC_ICONS = ["💬", "📌", "📢", "❓", "💡", "🎮", "🎵", "📷", "🛠", "📚", "💼", "🎉", "⚽", "🍕", "❤️", "🔥"];

type Props = {
  chatId: string;
  /** Правка темы; без неё — новая. */
  topic?: Topic | null;
  onDone: (topicId: string) => void;
  onClose: () => void;
};

/** «Новая тема» / «Изменить тему» — как openTopicDialog в public/js/components/topicTabs.js. */
export function TopicDialog({ chatId, topic, onDone, onClose }: Props) {
  const [title, setTitle] = useState(topic?.title ?? "");
  const [icon, setIcon] = useState(topic?.icon ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const clean = title.trim();
    if (!clean) {
      setError("Введите название");
      return;
    }
    setSaving(true);
    try {
      const res = topic ? await updateTopic(chatId, topic.id, { title: clean, icon }) : await createTopic(chatId, { title: clean, icon });
      onClose();
      onDone(res.topic.id);
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить тему"));
      setSaving(false);
    }
  };

  return (
    <Dialog title={topic ? "Изменить тему" : "Новая тема"} onClose={onClose}>
      <input
        className={styles.titleInput}
        placeholder="Название темы"
        aria-label="Название темы"
        maxLength={64}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
      />
      <div className={styles.icons} role="radiogroup" aria-label="Значок">
        {["", ...TOPIC_ICONS].map((i) => (
          <button
            key={i || "none"}
            type="button"
            role="radio"
            aria-checked={icon === i}
            title={i ? undefined : "Без значка"}
            className={icon === i ? `${styles.iconChoice} ${styles.iconActive}` : styles.iconChoice}
            onClick={() => setIcon(i)}
          >
            {i || "∅"}
          </button>
        ))}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <Button disabled={saving} onClick={() => void save()}>
        {topic ? "Сохранить" : "Создать"}
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
