// Причины жалоб и подписи к ним — как в server/routes/reports.js.

export const REASON_LABELS: Record<string, string> = {
  spam: "Спам",
  scam: "Мошенничество",
  fake: "Поддельный аккаунт",
  violence: "Насилие или угрозы",
  terrorism: "Терроризм",
  extremism: "Экстремизм",
  drugs: "Продажа наркотиков",
  illegal: "Незаконный контент",
  child_safety: "Угроза безопасности детей",
  other: "Другое",
};
export const REASONS = new Set(Object.keys(REASON_LABELS));

/** Метка в профиле заблокированного по жалобе (если её ещё нет). */
export const REASON_TO_LABEL: Record<string, string> = {
  scam: "scam",
  fake: "fake",
  terrorism: "terrorism",
  extremism: "extremism",
  drugs: "drugs",
};

const CHAT_KINDS: Record<string, string> = { dm: "Чат", group: "Группа", channel: "Канал", bot: "Бот-чат" };

/** Строка «на что жалоба» для модератора. */
export function targetSummary(targetType: string, target: any): string {
  if (targetType === "user") return `Пользователь: ${target.name}${target.username ? ` (@${target.username})` : ""}`;
  if (targetType === "chat") return `${CHAT_KINDS[target.type] ?? "Чат"}: ${target.title || "(без названия)"}`;
  return `Сообщение: «${(target.text || "[вложение]").slice(0, 200)}»`;
}

/** Кого блокировать по жалобе: сам пользователь, автор сообщения, владелец чата. */
export function responsibleUserId(targetType: string, target: any): string | null {
  if (targetType === "user") return target.id;
  if (targetType === "message") return target.senderId;
  return target.ownerId ?? null;
}
