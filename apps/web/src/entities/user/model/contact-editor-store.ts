import { useSyncExternalStore } from "react";

export type ContactEditorUser = {
  id: string;
  name: string;
  profileName?: string;
  avatarColor?: string | null;
  avatarImage?: string | null;
  avatarEmoji?: string | null;
};

type ContactEditorState = { user: ContactEditorUser; localName: string | null } | null;

let current: ContactEditorState = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function openContactEditor(user: ContactEditorUser, localName: string | null = null) {
  current = { user, localName };
  emit();
}

export function closeContactEditor() {
  if (!current) return;
  current = null;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useContactEditor = () => useSyncExternalStore(subscribe, () => current);
