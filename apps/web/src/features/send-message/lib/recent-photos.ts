// Последние фото галереи телефона — лента над кнопками в шторке скрепки (как в Telegram).
// Отдаёт Android-плагин Capacitor «RecentPhotos» (resources/android/java/RecentPhotosPlugin.java);
// в браузере и на iOS его нет — ленты нет, остаются кнопки.
export type RecentPhoto = { id: string; uri: string; thumb: string; mime: string; name: string };

type Plugin = {
  /** prompt — спросить разрешение, даже если раньше отказали (кнопка «Разрешить доступ»). */
  list: (o: { limit: number; prompt?: true }) => Promise<{ photos?: RecentPhoto[]; denied?: boolean }>;
  /** Кусок оригинала с offset (по умолчанию 0); done: false — есть ещё. */
  read: (o: { id: string; offset?: number }) => Promise<{ data: string; mime?: string; name?: string; done?: boolean }>;
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

/**
 * Новые сначала; denied — доступа к фото нет (система не спрашивает снова сама: после
 * отказа плагин ждёт prompt). Без плагина или при ошибке — пустой список.
 */
export async function loadRecentPhotos(limit = 30, prompt = false): Promise<{ photos: RecentPhoto[]; denied: boolean }> {
  const p = plugin();
  if (!p) return { photos: [], denied: false };
  try {
    const res = await p.list(prompt ? { limit, prompt: true } : { limit });
    return { photos: (res?.photos ?? []).filter((photo) => photo && photo.id && photo.thumb), denied: res?.denied === true };
  } catch {
    return { photos: [], denied: false };
  }
}

export async function listRecentPhotos(limit = 30): Promise<RecentPhoto[]> {
  return (await loadRecentPhotos(limit)).photos;
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
  // По кускам (~2 МБ): большой снимок одной base64-строкой не помещался бы в память.
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  let res = await p.read({ id: photo.id });
  for (;;) {
    const bytes = base64Bytes(res.data);
    parts.push(bytes);
    offset += bytes.length;
    if (res.done !== false || !bytes.length) break;
    res = { ...res, ...(await p.read({ id: photo.id, offset })) };
  }
  const type = res.mime || photo.mime || "image/jpeg";
  return new File(parts, res.name || photo.name || `photo-${photo.id}.jpg`, { type });
}
