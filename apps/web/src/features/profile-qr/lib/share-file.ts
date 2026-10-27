// Системное «Поделиться» файлом в приложении (Android и iOS) — shareFileNative из
// public/js/lib/nativeDownload.js: в WebView нет navigator.share. false — плагинов нет.
type Plugins = {
  Filesystem?: { writeFile: (o: { path: string; data: string; directory: string }) => Promise<{ uri: string }> };
  Share?: { share: (o: { title: string; text: string; files: string[]; dialogTitle: string }) => Promise<unknown> };
};
type NativeWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Plugins } };

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "file";

export async function shareFileNative(blob: Blob, name: string, text: string) {
  const cap = (window as NativeWindow).Capacitor;
  const { Filesystem, Share } = cap?.isNativePlatform?.() ? (cap.Plugins ?? {}) : {};
  if (!Filesystem || !Share) return false;
  const { uri } = await Filesystem.writeFile({ path: safeName(name), data: await blobToBase64(blob), directory: "CACHE" });
  await Share.share({ title: name, text, files: [uri], dialogTitle: "Поделиться" });
  return true;
}
