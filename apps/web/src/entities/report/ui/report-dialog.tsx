import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog } from "@/shared/ui";

import { type ReportReason, type ReportTarget, submitReport } from "../api/report";

import styles from "./report-dialog.module.css";

const REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Спам" },
  { value: "scam", label: "Мошенничество" },
  { value: "fake", label: "Поддельный аккаунт" },
  { value: "violence", label: "Насилие или угрозы" },
  { value: "terrorism", label: "Терроризм" },
  { value: "extremism", label: "Экстремизм" },
  { value: "drugs", label: "Продажа наркотиков" },
  { value: "illegal", label: "Незаконный контент" },
  { value: "child_safety", label: "Угроза безопасности детей" },
  { value: "other", label: "Другое" },
];

type Props = { target: ReportTarget; targetLabel: string; onClose: () => void };

/** «Пожаловаться на …» — как public/js/components/reportDialog.js. */
export function ReportDialog({ target, targetLabel, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await submitReport(target, reason, details);
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось отправить жалобу"));
      setSending(false);
    }
  };

  return (
    <Dialog title={`Пожаловаться на ${targetLabel}`} onClose={onClose}>
      <div className={styles.reasons} role="radiogroup" aria-label="Причина">
        {REASONS.map((r) => (
          <label key={r.value} className={styles.reason}>
            <input type="radio" name="report-reason" checked={r.value === reason} onChange={() => setReason(r.value)} />
            <span>{r.label}</span>
          </label>
        ))}
      </div>
      <textarea className={styles.details} rows={3} placeholder="Подробности (необязательно)" aria-label="Подробности" value={details} onChange={(e) => setDetails(e.target.value)} />
      {error ? <p className={styles.formError}>{error}</p> : null}
      <Button disabled={sending} onClick={() => void send()}>
        Отправить жалобу
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Отмена
      </Button>
    </Dialog>
  );
}
