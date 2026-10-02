const state = {
  user: null,
  accounts: [],
  chats: [],
  chatsLoaded: false,
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
