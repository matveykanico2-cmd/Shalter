// Minimal pub/sub store — no framework, just a plain object + listener set.
const state = {
  user: null,
  accounts: [],
  chats: [],
  // Идентификаторы тех, кто уже в контактах (GET /api/contacts/ids). Нужны
  // карточке контакта в чате, чтобы не предлагать добавить того, кто добавлен.
  contactIds: [],
  folders: [],
  settings: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

// Изменение собственного профиля — одной точкой.
//
// Своя запись лежит в состоянии дважды: в `user` (текущий аккаунт) и в
// `accounts` (список для переключателя). Раньше каждое место правило только
// первую, и вторая тихо расходилась: сменил имя — в переключателе осталось
// старое, и починить это могла только перезагрузка страницы. Здесь обновляются
// обе сразу, и все, кто подписан, узнают об этом немедленно.
export function updateSelf(patch) {
  const user = { ...state.user, ...patch };
  const accounts = (state.accounts ?? []).map((a) => (a.id === user.id ? { ...a, ...patch } : a));
  setState({ user, accounts });
  return user;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
