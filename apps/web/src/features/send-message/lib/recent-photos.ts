// Последние фото галереи телефона — лента над кнопками в шторке скрепки (как в Telegram).
// Отдаёт Android-плагин Capacitor «RecentPhotos» (resources/android/java/RecentPhotosPlugin.java);
// в браузере и на iOS его нет — ленты нет, остаются кнопки.
export type RecentPhoto = { id: string; uri: string; thumb: string; mime: string; name: string };

type Plugin = {
  list: (o: { limit: number }) => Promise<{ photos?: RecentPhoto[]; denied?: boolean }>;
  read: (o: { id: string }) => Promise<{ data: string; mime?: string; name?: string }>;
};

type NativeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { RecentPhotos?: Plugin } };
};

function plugin(): Plugin | null {
  const cap = (window as NativeWindow).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.RecentPhotos ?? null) : null;
}

export function hasRecentPhotos(): boolean {
  return plugin() !== null;
}

/** Новые сначала; без плагина, без разрешения или при ошибке — пустой список. */
export async function listRecentPhotos(limit = 30): Promise<RecentPhoto[]> {
  const p = plugin();
  if (!p) return [];
  try {
    const res = await p.list({ limit });
    return (res?.photos ?? []).filter((photo) => photo && photo.id && photo.thumb);
  } catch {
    return [];
  }
}

export function thumbSrc(photo: RecentPhoto): string {
  return photo.thumb.startsWith("data:") ? photo.thumb : `data:image/jpeg;base64,${photo.thumb}`;
}

function base64Bytes(data: string): Uint8Array<ArrayBuffer> {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Оригинал фото — File, как из <input type="file"> «Галереи». */
export async function readRecentPhoto(photo: RecentPhoto): Promise<File> {
  const p = plugin();
  if (!p) throw new Error("Галерея недоступна");
  const res = await p.read({ id: photo.id });
  const type = res.mime || photo.mime || "image/jpeg";
  return new File([base64Bytes(res.data)], res.name || photo.name || `photo-${photo.id}.jpg`, { type });
}
