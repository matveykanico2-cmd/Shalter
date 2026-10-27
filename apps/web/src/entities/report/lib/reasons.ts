import type { ReportReason } from "../api/report";

/** Причины жалобы — как REASON_LABELS в public/js/components/messageBubble.js и reportDialog.js. */
export const REASONS: readonly { value: ReportReason; label: string }[] = [
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

export const reasonLabel = (reason: string) => REASONS.find((r) => r.value === reason)?.label ?? reason;

/** Чем закончилась жалоба (REPORT_STATUS_LABELS). */
export const REPORT_STATUS_LABELS: Record<string, string> = {
  resolved_deleted: "✅ Удалено",
  resolved_banned: "🚫 Пользователь заблокирован",
  dismissed: "Отклонено",
};
