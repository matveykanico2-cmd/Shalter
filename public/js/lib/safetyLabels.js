export const SAFETY_LABELS = {
  scam: { short: "СКАМ", label: "Мошенничество", hint: "Аккаунт замечен в мошенничестве. Не переводите деньги и не сообщайте коды." },
  fake: { short: "ФЕЙК", label: "Поддельный аккаунт", hint: "Аккаунт выдаёт себя за другого человека или организацию." },
  terrorism: { short: "ТЕРРОРИЗМ", label: "Терроризм", hint: "Аккаунт связан с террористической деятельностью или её пропагандой." },
  extremism: { short: "ЭКСТРЕМИЗМ", label: "Экстремизм", hint: "Аккаунт замечен в распространении экстремистских материалов." },
  drugs: { short: "НАРКОТИКИ", label: "Продажа наркотиков", hint: "Аккаунт замечен в продаже запрещённых веществ." },
};

let catalogue = null;

export async function loadSafetyLabels(api) {
  try {
    const { labels } = await api.getSafetyLabels();
    catalogue = Object.fromEntries(labels.map((l) => [l.id, { short: l.short, label: l.label, hint: l.hint, color: l.color }]));
  } catch {
    catalogue = null;
  }
  return catalogue;
}

export function safetyLabelInfo(label) {
  if (!label) return null;
  return catalogue?.[label] ?? SAFETY_LABELS[label] ?? null;
}
