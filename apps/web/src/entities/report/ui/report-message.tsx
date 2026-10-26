import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Icon, toast } from "@/shared/ui";

import { type ResolveAction,resolveReport } from "../api/report";
import { reasonLabel, REPORT_STATUS_LABELS } from "../lib/reasons";

import styles from "./report-message.module.css";

export type ReportInfo = { reportId: string; reason: string; targetSummary?: string; targetType?: string; status?: string; canBan?: boolean };

type Props = {
  messageId: string;
  report: ReportInfo;
  /** Модератор Shalter решает прямо из сообщения; остальные видят «Ожидает решения». */
  canResolve: boolean;
  time: string;
  read: boolean | null;
};

/** Жалоба в чате модерации — ReportMessage из public/js/components/messageBubble.js. */
export function ReportMessage({ messageId, report, canResolve, time, read }: Props) {
  const [status, setStatus] = useState(report.status ?? "open");
  const [busy, setBusy] = useState(false);
  const resolve = async (action: ResolveAction) => {
    setBusy(true);
    try {
      setStatus((await resolveReport(report.reportId, action, messageId)).status);
    } catch (err) {
      toast(errorText(err, "Не удалось выполнить действие"), { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.report}>
      <p className={styles.title}>🚩 Жалоба: {reasonLabel(report.reason)}</p>
      {report.targetSummary ? <p className={styles.summary}>{report.targetSummary}</p> : null}
      {status === "open" ? (
        canResolve ? (
          <div className={styles.actions}>
            {report.targetType !== "user" ? (
              <button type="button" className={`${styles.action} ${styles.danger}`} disabled={busy} onClick={() => void resolve("delete")}>
                Удалить
              </button>
            ) : null}
            {report.canBan ? (
              <button type="button" className={`${styles.action} ${styles.danger}`} disabled={busy} onClick={() => void resolve("ban")}>
                Заблокировать
              </button>
            ) : null}
            <button type="button" className={styles.action} disabled={busy} onClick={() => void resolve("dismiss")}>
              Отклонить
            </button>
          </div>
        ) : (
          <p className={styles.note}>Ожидает решения администратора</p>
        )
      ) : (
        <p className={styles.note}>{REPORT_STATUS_LABELS[status] ?? status}</p>
      )}
      <div className={styles.meta}>
        <span>{time}</span>
        {read !== null ? <Icon name={read ? "CheckCheck" : "Check"} size={13} /> : null}
      </div>
    </div>
  );
}
