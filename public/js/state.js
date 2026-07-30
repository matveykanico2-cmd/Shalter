// Minimal pub/sub store — no framework, just a plain object + listener set.
const state = {
  user: null,
  accounts: [],
  chats: [],
  folders: [],
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
