import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { type Settings, useSettings, useUpdateSettings } from "@/entities/settings";

import { Button, Icon, SettingsPage, SettingsSection, TextField } from "@/shared/ui";

import { settingsViewQueries } from "../../api/settings-api";
import { monthDayToInputDate, parseDayMonth } from "../../lib/holidays";

import styles from "./sections.module.css";

type Holidays = Settings["holidays"];
type Custom = Holidays["custom"][number];

const NO_TITLE = "Укажите название праздника";
const BAD_DATE = "Дата — в формате ДД.ММ, например 14.02";

/** «Праздники» — renderHolidays: встроенные (скрыть, изменить), свои (добавить, изменить, удалить). */
export function HolidaysSection() {
  const settings = useSettings().data;
  const catalog = useQuery(settingsViewQueries.holidayCatalog()).data;
  const update = useUpdateSettings();
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; date: string } | null>(null);

  if (!settings || !catalog) return null;
  const holidays = settings.holidays;
  const disabled = new Set(holidays.disabled);
  // Новый праздник уходит без id — его выдаёт сервер.
  const save = (next: Partial<Holidays>) => update.mutateAsync({ holidays: { ...holidays, ...next } as Holidays }).catch(() => null);
  const startEdit = (h: Custom) => {
    setEditing({ id: h.id, title: h.title, date: monthDayToInputDate(h.date) });
    setError(null);
  };

  const addCustom = () => {
    const title = newTitle.trim();
    const date = parseDayMonth(newDate);
    if (!title) return setError(NO_TITLE);
    if (!date) return setError(BAD_DATE);
    setError(null);
    setNewTitle("");
    setNewDate("");
    void save({ custom: [...holidays.custom, { title, date } as Custom] });
  };
  const saveEdit = () => {
    if (!editing) return;
    const title = editing.title.trim();
    const date = parseDayMonth(editing.date);
    if (!title) return setError(NO_TITLE);
    if (!date) return setError(BAD_DATE);
    setEditing(null);
    setError(null);
    void save({ custom: holidays.custom.map((h) => (h.id === editing.id ? { ...h, title, date } : h)) });
  };
  const hideBuiltin = (id: string) => void save({ disabled: [...new Set([...holidays.disabled, id])] });
  const restoreBuiltins = () => {
    const ids = new Set(catalog.map((h) => h.id));
    void save({ disabled: holidays.disabled.filter((id) => !ids.has(id)) });
  };
  // Изменить встроенный — скрыть его и завести свой с тем же названием и датой.
  const editBuiltin = async (h: { id: string; title: string; date: string }) => {
    const saved = await save({ disabled: [...new Set([...holidays.disabled, h.id])], custom: [...holidays.custom, { title: h.title, date: h.date } as Custom] });
    const created = [...(saved?.holidays.custom ?? [])].reverse().find((c) => c.title === h.title && c.date === h.date);
    if (created) startEdit(created);
  };

  return (
    <SettingsPage subtitle="Напоминания в личном чате с Shalter в день праздника">
      <SettingsSection title="Встроенные">
        {catalog
          .filter((h) => !disabled.has(h.id))
          .map((h) => (
            <div key={h.id} className={styles.inline}>
              <span className={styles.grow}>{h.title}</span>
              <button type="button" className={styles.linkButton} onClick={() => void editBuiltin(h)}>
                Изменить
              </button>
              <button type="button" className={`${styles.iconButton} ${styles.danger}`} title="Удалить" aria-label={`Удалить «${h.title}»`} onClick={() => hideBuiltin(h.id)}>
                <Icon name="Trash" size={16} />
              </button>
            </div>
          ))}
        {catalog.some((h) => disabled.has(h.id)) ? (
          <button type="button" className={styles.linkButton} onClick={restoreBuiltins}>
            Вернуть скрытые встроенные
          </button>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Свои праздники">
        {holidays.custom.map((h) =>
          editing?.id === h.id ? (
            <div key={h.id}>
              <div className={styles.inline}>
                <TextField className={styles.grow} aria-label="Название праздника" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                <TextField type="date" aria-label="Дата" style={{ maxWidth: 170 }} value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
              </div>
              <div className={styles.actions}>
                <Button onClick={saveEdit}>Сохранить</Button>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setEditing(null);
                    setError(null);
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div key={h.id} className={styles.inline}>
              <span className={styles.grow}>
                {h.title}
                <span className={`${styles.hint} ${styles.mono}`}> {h.date.split("-").reverse().join(".")}</span>
              </span>
              <button type="button" className={styles.linkButton} onClick={() => startEdit(h)}>
                Изменить
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.danger}`}
                title="Удалить"
                aria-label={`Удалить «${h.title}»`}
                onClick={() => void save({ custom: holidays.custom.filter((c) => c.id !== h.id) })}
              >
                <Icon name="Trash" size={16} />
              </button>
            </div>
          )
        )}
        <div className={styles.inline}>
          <TextField className={styles.grow} placeholder="Название праздника" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <TextField type="date" aria-label="Дата праздника" style={{ maxWidth: 170 }} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.actions}>
          <Button onClick={addCustom}>Добавить праздник</Button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
