import { useSyncExternalStore } from "react";

type DeferredPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: DeferredPrompt | null = null;
let dialog = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

type PwaInstallState = { dialog: boolean; canPrompt: boolean; ios: boolean; installed: boolean };
const serverSnapshot: PwaInstallState = { dialog: false, canPrompt: false, ios: false, installed: false };
let snapshot: PwaInstallState = serverSnapshot;

function refreshSnapshot() {
  snapshot = {
    dialog,
    canPrompt: !!deferred,
    ios: isIosDevice(),
    installed: isPwaInstalled(),
  };
}

function notify() {
  refreshSnapshot();
  emit();
}

export function capturePwaInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as DeferredPrompt;
    notify();
  });
}
export const isIosDevice = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
export const isPwaInstalled = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const openPwaInstallDialog = () => { dialog = true; notify(); };
export const closePwaInstallDialog = () => { dialog = false; notify(); };
export async function promptPwaInstall() {
  if (!deferred) return false;
  const current = deferred;
  deferred = null;
  notify();
  await current.prompt();
  await current.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return true;
}
export function usePwaInstall() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => snapshot,
    () => serverSnapshot
  );
}
