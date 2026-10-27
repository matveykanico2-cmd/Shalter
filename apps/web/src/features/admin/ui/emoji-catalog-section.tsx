import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { renderCustomScene } from "@/shared/lib/anim";
import { errorText } from "@/shared/lib/error-text";
import { AnimatorDialog, askConfirm, askText, DomNode, Icon, SettingsPage } from "@/shared/ui";

import { adminQueries, createEmoji, type CustomEmoji, deleteEmoji, updateEmoji } from "../api/admin";

import styles from "./admin.module.css";

// «Настройки → Эмодзи» — renderEmojiCatalog в public/js/views/settings/index.js.

type Editing = { kind: "new" } | { kind: "edit"; emoji: CustomEmoji };

export function EmojiCatalogSection() {
  const client = useQueryClient();
  const query = useQuery(adminQueries.emoji());
  const emoji = query.data ?? [];
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setList = (fn: (list: CustomEmoji[]) => CustomEmoji[]) => client.setQueryData(adminQueries.emoji().queryKey, (prev) => fn(prev ?? []));

  const act = async (fn: () => Promise<string>, fallback: string) => {
    setError(null);
    try {
      setNotice(await fn());
    } catch (err) {
      setError(errorText(err, fallback));
    }
  };

  const remove = async (em: CustomEmoji) => {
    if (!(await askConfirm(`Удалить эмодзи${em.name ? ` «${em.name}»` : ""}?`))) return;
    await act(async () => {
      await deleteEmoji(em.id);
      setList((list) => list.filter((e) => e.id !== em.id));
      return "Эмодзи удалён";
    }, "Не удалось удалить");
  };

  return (
    <SettingsPage subtitle="Анимированные эмодзи Shalter — их рисуете вы, вставляют все">
      {notice ? <p className={styles.notice}>{`✅ ${notice}`}</p> : null}
      {error || query.isError ? <p className={styles.error}>{error ?? errorText(query.error, "Не удалось загрузить эмодзи")}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.accent} onClick={() => setEditing({ kind: "new" })}>
          ✏️ Нарисовать эмодзи
        </button>
      </div>
      <p className={styles.countTitle}>{`В каталоге — ${emoji.length}`}</p>
      {emoji.length === 0 ? (
        <p className={styles.empty}>Пока ничего не нарисовано</p>
      ) : (
        <div className={styles.emojiGrid}>
          {emoji.map((em) => (
            <div key={em.id} className={styles.emojiCell}>
              <DomNode key={JSON.stringify(em.scene)} create={() => renderCustomScene(em.scene, { size: 44 })} label={em.name || "Эмодзи"} />
              {em.name ? <span className={styles.emojiName}>{em.name}</span> : null}
              <div className={styles.emojiActions}>
                <button type="button" className={styles.iconBtn} title="Изменить" aria-label="Изменить" onClick={() => setEditing({ kind: "edit", emoji: em })}>
                  <Icon name="Edit" size={14} />
                </button>
                <button type="button" className={`${styles.iconBtn} ${styles.danger}`} title="Удалить" aria-label="Удалить" onClick={() => void remove(em)}>
                  <Icon name="Trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <AnimatorDialog
          title={editing.kind === "new" ? "Нарисовать эмодзи" : "Изменить эмодзи"}
          saveLabel={editing.kind === "new" ? "Сохранить эмодзи" : "Сохранить"}
          initial={editing.kind === "edit" ? editing.emoji.scene : null}
          onClose={() => setEditing(null)}
          onSave={(scene) => {
            if (editing.kind === "new") {
              void act(async () => {
                const name = ((await askText("Название эмодзи (необязательно)", { okLabel: "OK" })) || "").trim();
                const { emoji: created } = await createEmoji(name, scene);
                setList((list) => [created, ...list]);
                return "Эмодзи добавлен";
              }, "Не удалось сохранить");
            } else {
              const id = editing.emoji.id;
              void act(async () => {
                const { emoji: updated } = await updateEmoji(id, scene);
                setList((list) => list.map((e) => (e.id === updated.id ? updated : e)));
                return "Эмодзи обновлён";
              }, "Не удалось сохранить");
            }
          }}
        />
      ) : null}
    </SettingsPage>
  );
}
