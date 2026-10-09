// Скачивание файлов в Android-приложении. WebView сам ничего не скачивает: нажатие на
// <a download> там просто игнорируется. Перехватываем такие ссылки, забираем файл
// изнутри приложения (с куками сессии — приватные вложения иначе не отдадутся) и
// сохраняем в «Документы/Shalter»; не вышло — системное «Поделиться».
const FOLDER = "Shalter";

function plugins() {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "android") return null;
  const { Filesystem, Share } = cap.Plugins ?? {};
  return Filesystem ? { fs: Filesystem, share: Share ?? null } : null;
}

function safeName(name) {
  const clean = String(name || "file").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim();
  return clean.slice(0, 120) || "file";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function toast(text) {
  const note = document.createElement("div");
  note.className = "native-download-toast";
  note.textContent = text;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 3200);
}

async function save(p, pending, name) {
  const res = await pending;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await blobToBase64(await res.blob());
  const file = safeName(name);
  try {
    // Не затираем файл с тем же именем: «фото.jpg» → «фото (2).jpg».
    let path = `${FOLDER}/${file}`;
    for (let i = 2; i < 100; i++) {
      const exists = await p.fs.stat({ path, directory: "DOCUMENTS" }).then(() => true, () => false);
      if (!exists) break;
      path = `${FOLDER}/${file.replace(/(\.[^.]*)?$/, ` (${i})$1`)}`;
    }
    await p.fs.writeFile({ path, data, directory: "DOCUMENTS", recursive: true });
    toast(`Сохранено: Документы/${path}`);
  } catch {
    // Нет доступа к общей папке — отдаём файл системе: «Сохранить», «Открыть с помощью»…
    const { uri } = await p.fs.writeFile({ path: file, data, directory: "CACHE" });
    if (p.share) await p.share.share({ title: file, files: [uri] });
    else toast("Не удалось сохранить файл");
  }
}

export function installNativeDownloads() {
  const p = plugins();
  if (!p) return;
  // Капчер-фаза: раньше обработчиков самих ссылок и до того, как код, создавший
  // временную blob:-ссылку, успеет её отозвать (fetch берёт blob в момент вызова).
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target?.closest?.("a[download]");
      if (!a?.href) return;
      e.preventDefault();
      const name = a.getAttribute("download") || decodeURIComponent(new URL(a.href, location.href).pathname.split("/").pop() || "file");
      const pending = fetch(a.href, { credentials: "include" });
      toast("Скачиваем…");
      save(p, pending, name).catch((err) => toast(`Не удалось скачать: ${err.message || err}`));
    },
    true
  );
}

// Системное «Поделиться» файлом в приложении (Android и iOS): в WebView нет
// navigator.share. false — плагинов нет, пусть вызывающий поделится сам.
export async function shareFileNative(blob, name, text) {
  const cap = window.Capacitor;
  const { Filesystem, Share } = cap?.isNativePlatform?.() ? (cap.Plugins ?? {}) : {};
  if (!Filesystem || !Share) return false;
  const { uri } = await Filesystem.writeFile({ path: safeName(name), data: await blobToBase64(blob), directory: "CACHE" });
  await Share.share({ title: name, text, files: [uri], dialogTitle: "Поделиться" });
  return true;
}
