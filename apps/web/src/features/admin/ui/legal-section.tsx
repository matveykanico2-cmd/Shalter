import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { SettingsPage, SettingsSection, TextField } from "@/shared/ui";

import { adminQueries, exportUser, type FoundUser, lookupUser } from "../api/admin";
import { dateTime, downloadJson } from "../lib/format";

import styles from "./admin.module.css";

// «Настройки → Запросы органов» — renderLegal в public/js/views/settings/index.js.

export function LegalSection() {
  const client = useQueryClient();
  const log = useQuery(adminQueries.exports()).data ?? [];
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<FoundUser | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ exportId: string; messageCount: number } | null>(null);

  const lookup = async () => {
    setLookupError(null);
    setTarget(null);
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    try {
      setTarget((await lookupUser(q)).user);
    } catch (err) {
      setLookupError(errorText(err, "Пользователь не найден"));
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    setExportError(null);
    if (!target) return setExportError("Сначала найдите пользователя");
    const why = reason.trim();
    if (!why) return setExportError("Укажите основание — оно записывается в журнал");
    setBusy(true);
    try {
      const { exportId, data } = await exportUser(target.id, why);
      downloadJson(data, `export_${target.username || target.id}_${exportId}.json`);
      setLast({ exportId, messageCount: data.stats.messageCount });
      await client.invalidateQueries({ queryKey: adminQueries.exports().queryKey });
    } catch (err) {
      setExportError(errorText(err, "Не удалось выгрузить"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage subtitle="Адресная выгрузка хранимых данных одного пользователя по законному запросу">
      <SettingsSection>
        <div className={styles.body}>
          <p className={styles.hint}>Выгружается только то, что хранится на сервере. Каждая выгрузка фиксируется в журнале ниже.</p>
        </div>
      </SettingsSection>
      <SettingsSection title="Найти пользователя">
        <div className={styles.body}>
          <TextField
            placeholder="@username, +7… или id пользователя"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookup();
            }}
          />
          <button type="button" className={styles.accent} disabled={busy} onClick={() => void lookup()}>
            Найти
          </button>
          {lookupError ? <p className={styles.error}>{lookupError}</p> : null}
          {target ? (
            <div className={styles.inline}>
              <span className={styles.boxTitle}>{`${target.name}${target.username ? ` · @${target.username}` : ""}`}</span>
              <span className={`${styles.hint} ${styles.mono}`}>{target.phone || target.id}</span>
            </div>
          ) : null}
        </div>
      </SettingsSection>
      {target ? (
        <SettingsSection title="Выгрузка">
          <div className={styles.body}>
            <TextField placeholder="Основание: № дела / реквизиты постановления" value={reason} onChange={(e) => setReason(e.target.value)} />
            {exportError ? <p className={styles.error}>{exportError}</p> : null}
            <button type="button" className={styles.accent} disabled={busy} onClick={() => void runExport()}>
              {busy ? "Готовим файл…" : "Выгрузить файл переписки"}
            </button>
            {last ? <p className={styles.success}>{`✅ Файл выгружен (${last.messageCount} сообщений). Запись в журнале: ${last.exportId}.`}</p> : null}
          </div>
        </SettingsSection>
      ) : null}
      <SettingsSection title="Журнал выгрузок">
        <div className={styles.body}>
          {log.length === 0 ? (
            <p className={styles.hint}>Выгрузок ещё не было.</p>
          ) : (
            log.map((e) => (
              <div key={e.id} className={styles.logRow}>
                <div className={styles.logMain}>
                  <span>{"name" in e.target ? `${e.target.name}${e.target.username ? ` @${e.target.username}` : ""}` : e.target.id}</span>
                  <span className={styles.logReason}>{e.reason}</span>
                </div>
                <div className={styles.logMeta}>{`${dateTime(e.at)} · ${e.messageCount} сообщ. · ${"name" in e.admin ? e.admin.name : e.admin.id}`}</div>
              </div>
            ))
          )}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
