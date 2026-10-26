import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { SettingsPage, SettingsSection } from "@/shared/ui";

import { adminQueries } from "../api/admin";
import { formatBytes, formatUptime } from "../lib/format";

import styles from "./admin.module.css";

// «Настройки → Состояние сервера» — renderServer (meter, statRow) в public/js/views/settings/index.js.

const REFRESH_MS = 5000;
const TABLES_SHOWN = 12;

const level = (p: number) => (p >= 90 ? styles.critical : p >= 75 ? styles.warn : "");

function Meter({ label, percent, value, hint }: { label: string; percent: number; value?: string; hint?: string | null }) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span className={styles.meterLabel}>{label}</span>
        <span className={`${styles.meterValue} ${level(p)}`}>{`${p.toFixed(p < 10 ? 1 : 0)}%`}</span>
      </div>
      <div className={styles.meterTrack} role="meter" aria-label={label} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`${styles.meterFill} ${level(p)}`} style={{ width: `${p}%` }} />
      </div>
      {value ? <p className={styles.meterSub}>{value}</p> : null}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ServerSection() {
  const [auto, setAuto] = useState(true);
  const [allTables, setAllTables] = useState(false);
  const query = useQuery({ ...adminQueries.server(), refetchInterval: auto ? REFRESH_MS : false, refetchIntervalInBackground: false });
  const data = query.data;

  if (!data) {
    return (
      <SettingsPage>
        {query.isError ? <p className={styles.error}>{errorText(query.error, "Не удалось получить состояние сервера")}</p> : <p className={styles.hint}>Считаем…</p>}
      </SettingsPage>
    );
  }

  const { host, cpu, memory, disk, storage, db, realtime } = data;
  const proc = data.process;

  return (
    <SettingsPage subtitle="Диск, процессор и память машины, на которой работает Shalter. Только чтение.">
      <div className={styles.toolbar}>
        <span className={`${styles.hint} ${styles.mono}`}>{`Обновлено в ${new Date(data.at).toLocaleTimeString("ru-RU")}`}</span>
        <div className={styles.inline}>
          <label className={styles.auto}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>каждые 5 с</span>
          </label>
          <button type="button" className={styles.outline} disabled={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching ? "…" : "Обновить"}
          </button>
        </div>
      </div>
      {query.isError ? <p className={styles.error}>{errorText(query.error, "Не удалось получить состояние сервера")}</p> : null}
      <SettingsSection title="Нагрузка">
        <div className={styles.body}>
          <Meter
            label="Процессор"
            percent={cpu.usagePercent}
            value={`${host.cores} ядер · ${host.cpuModel}`}
            hint={
              cpu.loadAvg
                ? `Средняя нагрузка: ${cpu.loadAvg.map((v) => v.toFixed(2)).join(" · ")} (1 / 5 / 15 мин). Больше числа ядер (${host.cores}) — очередь на выполнение, сервер не успевает.`
                : null
            }
          />
          {cpu.perCore.length ? (
            <div className={styles.cores}>
              {cpu.perCore.map((p, i) => (
                <div key={i} className={styles.core} title={`Ядро ${i + 1}: ${p.toFixed(0)}%`}>
                  <div className={`${styles.coreFill} ${level(p)}`} style={{ height: `${Math.max(2, p)}%` }} />
                </div>
              ))}
            </div>
          ) : null}
          <Meter label="Оперативная память" percent={memory.usedPercent} value={`${formatBytes(memory.used)} из ${formatBytes(memory.total)} · свободно ${formatBytes(memory.free)}`} />
        </div>
      </SettingsSection>
      <SettingsSection title="Диск">
        <div className={styles.body}>
          {"error" in disk ? (
            <p className={styles.error}>{`Не удалось прочитать раздел: ${disk.error}`}</p>
          ) : (
            <Meter
              label="Раздел с данными"
              percent={disk.usedPercent}
              value={`${formatBytes(disk.used)} занято · ${formatBytes(disk.free)} свободно из ${formatBytes(disk.total)}`}
              hint={disk.usedPercent >= 90 ? "Места почти нет — загрузка вложений начнёт падать с ошибкой, а база перестанет писать." : `Раздел, где лежит ${disk.path}`}
            />
          )}
          <div>
            <Stat label="База data/app.db" value={formatBytes(storage.db)} />
            <Stat label="Журнал WAL" value={`${formatBytes(storage.wal)}${storage.wal > 64 * 1024 * 1024 ? " — необычно много" : ""}`} />
            <Stat
              label="Вложения"
              value={
                storage.uploadsInS3
                  ? "хранятся в S3 — размер считает само хранилище"
                  : `${formatBytes(storage.uploads)} · ${storage.uploadFiles} ${storage.uploadsTruncated ? "файлов (посчитаны не все)" : "файлов"}`
              }
            />
            <Stat label="Всего данных Shalter" value={formatBytes(storage.total)} />
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title="База данных">
        <div className={styles.body}>
          <div>
            <Stat label="Размер по страницам" value={`${formatBytes(db.pageCount * db.pageSize)} · ${db.pageCount} × ${formatBytes(db.pageSize)}`} />
            {db.freeBytes > 0 ? <Stat label="Свободно внутри базы" value={`${formatBytes(db.freeBytes)} — вернёт VACUUM`} /> : null}
            <Stat label="Всего строк" value={String(db.totalRows)} />
            {db.tables.slice(0, allTables ? db.tables.length : TABLES_SHOWN).map((t) => (
              <Stat key={t.name} label={t.name} value={String(t.rows)} />
            ))}
          </div>
          {db.tables.length > TABLES_SHOWN ? (
            <button type="button" className={styles.outline} onClick={() => setAllTables((v) => !v)}>
              {allTables ? "Свернуть" : `Показать все таблицы (${db.tables.length})`}
            </button>
          ) : null}
        </div>
      </SettingsSection>
      <SettingsSection title="Процесс Shalter">
        <div className={styles.body}>
          <div>
            <Stat label="Работает" value={formatUptime(proc.uptimeSec)} />
            <Stat label="Память процесса (RSS)" value={`${formatBytes(proc.rss)} · ${proc.sharePercent.toFixed(1)}% от всей памяти`} />
            <Stat label="Куча V8" value={`${formatBytes(proc.heapUsed)} из ${formatBytes(proc.heapTotal)}`} />
            <Stat label="PID" value={String(proc.pid)} />
            <Stat label="Пользователей в сети" value={`${realtime.onlineUsers}`} />
            <Stat label="Открытых соединений" value={`${realtime.sockets} (вкладки и устройства)`} />
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title="Машина">
        <div className={styles.body}>
          <div>
            <Stat label="Имя" value={host.hostname} />
            <Stat label="Система" value={`${host.platform} · ${host.arch}`} />
            <Stat label="Node.js" value={host.node} />
            <Stat label="Аптайм" value={formatUptime(host.uptimeSec)} />
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
