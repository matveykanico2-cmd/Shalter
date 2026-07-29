"use client";

// Minimal pub/sub so the chat list refetches after actions taken deeper in
// the tree (send message, mute, pin) without a full realtime layer.
const bus = typeof window !== "undefined" ? new EventTarget() : null;

export function notifyChatsChanged() {
  bus?.dispatchEvent(new Event("chats:changed"));
}

export function onChatsChanged(handler: () => void) {
  if (!bus) return () => {};
  bus.addEventListener("chats:changed", handler);
  return () => bus.removeEventListener("chats:changed", handler);
}
