import { useSyncExternalStore } from "react";

type DeferredPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: DeferredPrompt | null = null;
let dialog = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function capturePwaInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as DeferredPrompt;
    emit();
  });
}
export const isIosDevice = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
export const isPwaInstalled = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const openPwaInstallDialog = () => { dialog = true; emit(); };
export const closePwaInstallDialog = () => { dialog = false; emit(); };
export async function promptPwaInstall() {
  if (!deferred) return false;
  const current = deferred;
  deferred = null;
  emit();
  await current.prompt();
  await current.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  return true;
}
export function usePwaInstall() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => ({ dialog, canPrompt: !!deferred, ios: isIosDevice(), installed: isPwaInstalled() }),
    () => ({ dialog: false, canPrompt: false, ios: false, installed: false })
  );
}
