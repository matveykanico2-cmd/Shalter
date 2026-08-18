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

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
