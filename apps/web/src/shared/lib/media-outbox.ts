export type MediaOutboxFile = { file: Blob; name: string; mimeType: string; kind: "image" | "video" | "file" };
export type MediaOutboxEntry = {
  id: string;
  chatId: string;
  path: string;
  body: Record<string, unknown>;
  files: MediaOutboxFile[];
  spoiler: boolean;
  createdAt: number;
};

const DB_NAME = "shalter-outbox";
const STORE = "media";
let sequence = 0;

function database() {
  if (typeof indexedDB === "undefined") return Promise.resolve<IDBDatabase | null>(null);
  return new Promise<IDBDatabase | null>((resolve) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function queueMediaUpload(entry: Omit<MediaOutboxEntry, "id" | "createdAt">) {
  const db = await database();
  if (!db) return null;
  const id = `media_${Date.now()}_${++sequence}`;
  const saved = await new Promise<boolean>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...entry, id, createdAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
  db.close();
  return saved ? id : null;
}

export async function forgetMediaUpload(id: string) {
  const db = await database();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function syncMediaUploads() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const withSync = registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
    await withSync.sync?.register("send-media");
    registration.active?.postMessage({ type: "sync-media" });
  } catch {
    // Очередь останется в IndexedDB до следующего запуска или online.
  }
}
