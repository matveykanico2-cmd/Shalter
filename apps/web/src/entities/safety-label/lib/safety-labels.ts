// Метки безопасности — public/js/lib/safetyLabels.js: встроенные на случай, пока
// каталог с сервера не пришёл (или не загрузился).
export type SafetyLabelInfo = { short: string; label: string; hint: string; color?: string };

export const SAFETY_LABELS: Record<string, SafetyLabelInfo> = {
  scam: { short: "СКАМ", label: "Мошенничество", hint: "Аккаунт замечен в мошенничестве. Не переводите деньги и не сообщайте коды." },
  fake: { short: "ФЕЙК", label: "Поддельный аккаунт", hint: "Аккаунт выдаёт себя за другого человека или организацию." },
  terrorism: { short: "ТЕРРОРИЗМ", label: "Терроризм", hint: "Аккаунт связан с террористической деятельностью или её пропагандой." },
  extremism: { short: "ЭКСТРЕМИЗМ", label: "Экстремизм", hint: "Аккаунт замечен в распространении экстремистских материалов." },
  drugs: { short: "НАРКОТИКИ", label: "Продажа наркотиков", hint: "Аккаунт замечен в продаже запрещённых веществ." },
};

/** Описание метки: из каталога сервера, иначе встроенное. */
export function safetyLabelInfo(id: string | null | undefined, catalogue?: readonly (SafetyLabelInfo & { id: string })[]): SafetyLabelInfo | null {
  if (!id) return null;
  return catalogue?.find((l) => l.id === id) ?? SAFETY_LABELS[id] ?? null;
}
