import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { SafetyBadgePreview, type SafetyLabel, safetyLabelQueries } from "@/entities/safety-label";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { askConfirm, Icon, SettingsSection, TextField } from "@/shared/ui";

import { adminQueries, createLabel, createStatus, deleteLabel, deleteStatus, type Moderation, updateLabel } from "../api/admin";

import styles from "./admin.module.css";

// «Метки безопасности» и «Готовые статусы» — части renderModeration.

const DEFAULT_COLOR = "#c6403b";
const LABEL_COLORS = [DEFAULT_COLOR, "#d9822e", "#e0a423", "#2f9e5a", "#1c9bd9", "#7c6fd6", "#8a5cf6", "#5a6472"];

type LabelDraft = { short: string; label: string; hint: string; color: string };

/** Метки и статусы изменились — обновить модерацию и каталог меток у всех экранов. */
function useReload() {
  const client = useQueryClient();
  return async () => {
    await client.invalidateQueries({ queryKey: adminQueries.moderation().queryKey });
    void client.invalidateQueries({ queryKey: safetyLabelQueries.baseKey });
  };
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className={styles.swatches}>
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={value === c ? `${styles.swatch} ${styles.active}` : styles.swatch}
          style={{ background: c }}
          title="Выбрать цвет"
          aria-label={`Цвет ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function LabelsEditor({ labels }: { labels: SafetyLabel[] }) {
  const reload = useReload();
  const [editing, setEditing] = useState<(LabelDraft & { id: string }) | null>(null);
  const [draft, setDraft] = useState<LabelDraft>({ short: "", label: "", hint: "", color: DEFAULT_COLOR });
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      await updateLabel(editing.id, { short: editing.short, label: editing.label, hint: editing.hint, color: editing.color });
      setEditing(null);
      await reload();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить метку"));
    }
  };

  const create = async () => {
    setError(null);
    try {
      await createLabel({ id: draft.short, ...draft });
      setDraft({ short: "", label: "", hint: "", color: DEFAULT_COLOR });
      await reload();
    } catch (err) {
      setError(errorText(err, "Не удалось создать метку"));
    }
  };

  const remove = async (l: SafetyLabel) => {
    if (!(await askConfirm(`Удалить метку «${l.label}»? Она снимется со всех, кому поставлена.`))) return;
    await deleteLabel(l.id);
    await reload();
  };

  return (
    <SettingsSection title="Метки безопасности">
      <div className={styles.body}>
        {labels.map((l) =>
          editing?.id === l.id ? (
            <div key={l.id} className={styles.box}>
              <p className={styles.fieldLabel}>Изменить метку</p>
              <TextField value={editing.short} maxLength={16} onChange={(e) => setEditing({ ...editing, short: e.target.value })} />
              <TextField value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              <TextField value={editing.hint} onChange={(e) => setEditing({ ...editing, hint: e.target.value })} />
              <ColorPicker value={editing.color} onChange={(color) => setEditing({ ...editing, color })} />
              <div className={styles.inline}>
                <button type="button" className={styles.accent} onClick={() => void save()}>
                  Сохранить
                </button>
                <button type="button" className={styles.dangerLink} onClick={() => setEditing(null)}>
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div key={l.id} className={styles.labelRow}>
              <div>
                <p className={styles.labelTitle}>
                  <SafetyBadgePreview short={l.short} color={l.color || "var(--color-danger)"} /> {l.label}
                </p>
                <p className={styles.hint}>{l.hint || "—"}</p>
              </div>
              <div className={styles.inline}>
                <button
                  type="button"
                  className={styles.dangerLink}
                  onClick={() => setEditing({ id: l.id, short: l.short, label: l.label, hint: l.hint || "", color: l.color || DEFAULT_COLOR })}
                >
                  Изменить
                </button>
                <button type="button" className={styles.dangerLink} onClick={() => void remove(l)}>
                  Удалить
                </button>
              </div>
            </div>
          )
        )}
        <p className={styles.fieldLabel}>Новая метка</p>
        <TextField placeholder="СПАМ" maxLength={16} value={draft.short} onChange={(e) => setDraft({ ...draft, short: e.target.value })} />
        <TextField placeholder="Спам-рассылка" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <TextField placeholder="Пояснение, которое увидит собеседник" value={draft.hint} onChange={(e) => setDraft({ ...draft, hint: e.target.value })} />
        <p className={styles.fieldLabel}>Цвет метки</p>
        <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
        <p className={styles.hint}>
          Так метка будет выглядеть: <SafetyBadgePreview short={(draft.short || "МЕТКА").toUpperCase()} color={draft.color} />
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        <button type="button" className={styles.accent} onClick={() => void create()}>
          Добавить метку
        </button>
        <p className={styles.hint}>Короткая надпись — то, что видно рядом с именем (СКАМ, ФЕЙК). Латиницей задавать не нужно: идентификатор соберётся сам.</p>
      </div>
    </SettingsSection>
  );
}

export function StatusCatalogEditor({ items }: { items: Moderation["statusCatalog"] }) {
  const reload = useReload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!image) {
      setError("Сначала выберите картинку");
      return;
    }
    setError(null);
    try {
      await createStatus({ image, name });
      setImage(null);
      setName("");
      await reload();
    } catch (err) {
      setError(errorText(err, "Не удалось добавить статус"));
    }
  };

  return (
    <SettingsSection title="Готовые статусы">
      <div className={styles.body}>
        <div className={styles.statusGrid}>
          {items.length ? (
            items.map((s) => (
              <div key={s.id} className={styles.statusCell}>
                <img className={styles.statusImg} src={s.image} alt="" title={s.name || ""} />
                <button
                  type="button"
                  className={styles.statusRemove}
                  title="Удалить"
                  aria-label="Удалить"
                  onClick={async () => {
                    if (!(await askConfirm(`Удалить статус «${s.name || "без названия"}»? У тех, кто уже его выбрал, он останется.`))) return;
                    await deleteStatus(s.id);
                    await reload();
                  }}
                >
                  <Icon name="X" size={10} />
                </button>
              </div>
            ))
          ) : (
            <p className={styles.empty}>Каталог пуст</p>
          )}
        </div>
        {image ? <img className={styles.statusImg} src={image} alt="" /> : null}
        <button type="button" className={styles.outline} onClick={() => fileRef.current?.click()}>
          {image ? "Заменить картинку" : "Загрузить картинку"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError(null);
            try {
              setImage(await fileToImageDataUrl(file, 96, "image/png", 0.92));
            } catch (err) {
              setError(errorText(err, "Не удалось загрузить картинку"));
            }
          }}
        />
        <TextField placeholder="Название (необязательно)" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        {error ? <p className={styles.error}>{error}</p> : null}
        <button type="button" className={styles.accent} onClick={() => void add()}>
          Добавить в каталог
        </button>
      </div>
    </SettingsSection>
  );
}
