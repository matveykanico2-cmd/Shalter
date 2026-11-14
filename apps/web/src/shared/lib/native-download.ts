// Скачивание файлов в приложении (Android и iOS), как public/js/lib/nativeDownload.js. WebView сам
// не скачивает: <a download> там игнорируется (Android) или открывает «Поделиться» и уводит
// приложение на домашний экран (iOS). Забираем файл изнутри приложения (с cookie сессии):
// на Android сохраняем в «Документы/Shalter» (не вышло — системное «Поделиться»), на iOS сразу
// «Поделиться» — там «Сохранить в Файлы» и «Сохранить изображение»: папка «Документы»
// приложения на iPhone человеку не видна, и «Сохранено» вело в никуда.
import { type Download,findDownload, markDownloadSaved } from "./downloads";

const FOLDER = "Shalter";

type Fs = {
  stat: (o: { path: string; directory: string }) => Promise<unknown>;
  writeFile: (o: { path: string; data: string; directory: string; recursive?: boolean }) => Promise<{ uri: string }>;
};
type Share = { share: (o: { title?: string; text?: string; files?: string[]; dialogTitle?: string }) => Promise<unknown> };
type CapWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { Filesystem?: Fs; Share?: Share } };
  shalterDesktop?: { openFile?: (path: string) => Promise<unknown> };
};

function plugins() {
  const cap = (window as CapWindow).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const fs = cap.Plugins?.Filesystem;
  return fs ? { fs, share: cap.Plugins?.Share ?? null, ios: cap.getPlatform?.() === "ios" } : null;
}

type Plugins = NonNullable<ReturnType<typeof plugins>>;

const safeName = (name: string) =>
  // eslint-disable-next-line no-control-regex
  name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 120) || "file";

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function shareFile(p: Plugins, data: string, file: string) {
  const { uri } = await p.fs.writeFile({ path: file, data, directory: "CACHE" });
  await p.share!.share({ title: file, files: [uri] });
}

async function save(p: Plugins, pending: Promise<Response>, name: string, notify: (text: string) => void) {
  const res = await pending;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await blobToBase64(await res.blob());
  const file = safeName(name);
  if (p.ios && p.share) {
    // Закрыли «Поделиться», ничего не выбрав, — это не ошибка.
    await shareFile(p, data, file).catch((err: unknown) => {
      if (!/cancel/i.test(err instanceof Error ? err.message : String(err))) throw err;
    });
    return;
  }
  try {
    // Не затираем файл с тем же именем: «фото.jpg» → «фото (2).jpg».
    let path = `${FOLDER}/${file}`;
    for (let i = 2; i < 100; i++) {
      const exists = await p.fs.stat({ path, directory: "DOCUMENTS" }).then(
        () => true,
        () => false
      );
      if (!exists) break;
      path = `${FOLDER}/${file.replace(/(\.[^.]*)?$/, ` (${i})$1`)}`;
    }
    const saved = await p.fs.writeFile({ path, data, directory: "DOCUMENTS", recursive: true });
    return { uri: saved.uri, path: `Документы/${path}` };
  } catch {
    // Нет доступа к общей папке — отдаём файл системе: «Сохранить», «Открыть с помощью»…
    if (p.share) await shareFile(p, data, file);
    else notify("Не удалось сохранить файл");
  }
  return null;
}

export async function openSavedDownload(item: Pick<Download, "localUri" | "name">): Promise<boolean> {
  if (!item.localUri) return false;
  const desktop = (window as CapWindow).shalterDesktop;
  if (desktop?.openFile) {
    await desktop.openFile(item.localUri);
    return true;
  }
  const p = plugins();
  if (!p?.share) return false;
  await p.share.share({ title: item.name, files: [item.localUri], dialogTitle: "Открыть или изменить файл" });
  return true;
}

/** Tauri сообщает путь после системного скачивания; повторный клик открывает эту копию. */
export function installDesktopDownloadReuse(notify: (text: string) => void) {
  const desktop = (window as CapWindow).shalterDesktop;
  if (!desktop?.openFile) return () => {};
  const saved = (event: Event) => {
    const detail = (event as CustomEvent<{ url?: string; path?: string }>).detail;
    if (!detail?.url || !detail.path) return;
    const name = detail.path.split(/[\\/]/).pop() || "file";
    markDownloadSaved(detail.url, detail.path, detail.path, name);
    notify("Файл сохранён — его можно открыть в «Загрузках»");
  };
  const click = (event: MouseEvent) => {
    const a = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[download]");
    const old = a?.href ? findDownload(a.href) : null;
    if (!old?.localUri) return;
    event.preventDefault();
    notify("Файл уже сохранён — открываем сохранённую копию");
    void openSavedDownload(old).catch(() => notify("Не удалось открыть сохранённый файл"));
  };
  window.addEventListener("shalter:native-download-saved", saved);
  document.addEventListener("click", click, true);
  return () => {
    window.removeEventListener("shalter:native-download-saved", saved);
    document.removeEventListener("click", click, true);
  };
}

/** Перехват <a download> в приложении на Android и iOS; в браузере ничего не делает. */
export function installNativeDownloads(notify: (text: string) => void) {
  const p = plugins();
  if (!p) return () => {};
  // Фаза захвата: раньше обработчиков самих ссылок и до того, как временную blob:-ссылку отзовут.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[download]");
    if (!a?.href) return;
    e.preventDefault();
    const name = a.getAttribute("download") || decodeURIComponent(new URL(a.href, location.href).pathname.split("/").pop() || "file");
    const old = findDownload(a.href);
    if (old?.localUri) {
      notify("Файл уже сохранён — открываем сохранённую копию");
      void openSavedDownload(old).catch(() => notify(`Файл сохранён: ${old.savedPath ?? old.name}`));
      return;
    }
    const pending = fetch(a.href, { credentials: "same-origin" });
    notify("Скачиваем…");
    save(p, pending, name, notify)
      .then((saved) => {
        if (!saved) return;
        markDownloadSaved(a.href, saved.uri, saved.path, name);
        notify(`Файл сохранён: ${saved.path}. Откройте его в «Загрузках»`);
      })
      .catch((err: unknown) => notify(`Не удалось скачать: ${err instanceof Error ? err.message : String(err)}`));
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
