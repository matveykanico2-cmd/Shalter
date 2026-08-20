// Public safety markers an admin can put on an account (server/routes/admin.js's
// SAFETY_LABELS — keep the two lists in sync). Same purpose as Telegram's own
// SCAM/FAKE badges: a warning shown to whoever is *about* to talk to the
// account, at the moment they can still walk away, rather than a note filed in
// a moderation queue nobody outside the admin ever sees.
//
// `short` is what fits on a chat row / next to a name; `label` is the fuller
// wording used on the profile card and in the admin's own list.
export const SAFETY_LABELS = {
  scam: { short: "СКАМ", label: "Мошенничество", hint: "Аккаунт замечен в мошенничестве. Не переводите деньги и не сообщайте коды." },
  fake: { short: "ФЕЙК", label: "Поддельный аккаунт", hint: "Аккаунт выдаёт себя за другого человека или организацию." },
  terrorism: { short: "ТЕРРОРИЗМ", label: "Терроризм", hint: "Аккаунт связан с террористической деятельностью или её пропагандой." },
  extremism: { short: "ЭКСТРЕМИЗМ", label: "Экстремизм", hint: "Аккаунт замечен в распространении экстремистских материалов." },
  drugs: { short: "НАРКОТИКИ", label: "Продажа наркотиков", hint: "Аккаунт замечен в продаже запрещённых веществ." },
};

// Метки, добавленные администратором (server/data/safetyLabels.js), приходят
// с сервера — список выше остаётся запасным на случай, если каталог ещё не
// загрузился: значок не должен пропадать с профиля из-за одного медленного
// запроса.
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
