// Встроенный браузер и Instant View — как openInAppBrowser (public/js/components/inAppBrowser.js)
// и openInstantView (instantView.js): открыть можно откуда угодно, окно рисует <BrowserHost />.
import { embedUrlFor, hostOf, isEmbedPlayer, isNeverFrameable } from "../lib/link-safety";

import { askConfirm } from "./ask-store";

export type BrowserPage = { id: number; kind: "browser" | "instant-view"; url: string; unsafe: boolean; warning: string | null };
type Opts = { unsafe?: boolean; warning?: string | null };

let current: BrowserPage | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const show = (page: BrowserPage | null) => {
  current = page;
  emit();
};

type NativeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Browser?: { open: (o: Record<string, string>) => Promise<void> } } };
  shalterDesktop?: { openBrowser?: (url: string) => void };
};

// Настоящий встроенный браузер оболочки: на Android — Chrome Custom Tabs
// (@capacitor/browser), в приложении для компьютера — отдельное окно (Tauri).
// В нём открывается любой сайт; во фрейме страницы большинство сайтов запрещены.
function nativeBrowser(): ((url: string) => void) | null {
  const w = window as NativeWindow;
  const plugin = w.Capacitor?.isNativePlatform?.() ? w.Capacitor.Plugins?.Browser : null;
  if (plugin?.open) {
    const toolbarColor = getComputedStyle(document.body).getPropertyValue("--color-surface").trim() || "#ffffff";
    return (url) => void plugin.open({ url, toolbarColor, presentationStyle: "popover" }).catch(() => window.open(url, "_blank"));
  }
  const desktop = w.shalterDesktop?.openBrowser;
  return desktop ? (url) => desktop(url) : null;
}

export function openExternally(url: string) {
  const open = nativeBrowser();
  if (open) return open(url);
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openInAppBrowser(url: string, { unsafe = false, warning = null }: Opts = {}) {
  // В приложении (Android, компьютер) — сразу настоящий встроенный браузер.
  // Подозрительная ссылка — сначала предупреждение.
  const native = nativeBrowser();
  if (native && /^https?:/i.test(url)) {
    if (!warning && !unsafe) return native(url);
    void askConfirm(`${warning || "Ссылка может быть небезопасной."}\n\n${hostOf(url)}`, { okLabel: "Всё равно открыть", danger: unsafe }).then((ok) => ok && native(url));
    return;
  }
  const target = embedUrlFor(url);
  if (!unsafe && !warning && !isEmbedPlayer(target) && isNeverFrameable(target)) return openExternally(url);
  show({ id: ++seq, kind: "browser", url, unsafe, warning });
}

/** Статья по ссылке в простом виде для чтения. */
export function openInstantView(url: string, { unsafe = false, warning = null }: Opts = {}) {
  show({ id: ++seq, kind: "instant-view", url, unsafe, warning });
}

export const browserStore = {
  get: () => current,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  close(id: number) {
    if (current?.id === id) show(null);
  },
};
