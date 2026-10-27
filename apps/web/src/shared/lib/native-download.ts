// Скачивание файлов в приложении (Android и iOS), как public/js/lib/nativeDownload.js. WebView сам
// не скачивает: <a download> там игнорируется (Android) или открывает «Поделиться» и уводит
// приложение на домашний экран (iOS). Забираем файл изнутри приложения (с cookie сессии)
// и сохраняем в «Документы/Shalter»; не вышло — системное «Поделиться».
const FOLDER = "Shalter";

type Fs = {
  stat: (o: { path: string; directory: string }) => Promise<unknown>;
  writeFile: (o: { path: string; data: string; directory: string; recursive?: boolean }) => Promise<{ uri: string }>;
};
type Share = { share: (o: { title?: string; text?: string; files?: string[]; dialogTitle?: string }) => Promise<unknown> };
type CapWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Filesystem?: Fs; Share?: Share } };
};

function plugins() {
  const cap = (window as CapWindow).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const fs = cap.Plugins?.Filesystem;
  return fs ? { fs, share: cap.Plugins?.Share ?? null } : null;
}

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

async function save(p: { fs: Fs; share: Share | null }, pending: Promise<Response>, name: string, notify: (text: string) => void) {
  const res = await pending;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await blobToBase64(await res.blob());
  const file = safeName(name);
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
    await p.fs.writeFile({ path, data, directory: "DOCUMENTS", recursive: true });
    notify(`Сохранено: Документы/${path}`);
  } catch {
    // Нет доступа к общей папке — отдаём файл системе: «Сохранить», «Открыть с помощью»…
    const { uri } = await p.fs.writeFile({ path: file, data, directory: "CACHE" });
    if (p.share) await p.share.share({ title: file, files: [uri] });
    else notify("Не удалось сохранить файл");
  }
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
    const pending = fetch(a.href, { credentials: "same-origin" });
    notify("Скачиваем…");
    save(p, pending, name, notify).catch((err: unknown) => notify(`Не удалось скачать: ${err instanceof Error ? err.message : String(err)}`));
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
