import type { Uploaded, UploadKind } from "../api/upload";

export type MediaOutboxFile = { file: Blob; name: string; mimeType: string; kind: UploadKind; uploaded?: Uploaded };
export type MediaOutboxEntry = {
  ownerId: string;
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
    tx.onabort = () => resolve();
  });
  db.close();
}

/** Update only an existing entry: cancellation must never be undone by an upload. */
export async function rememberMediaUpload(id: string, index: number, uploaded: Uploaded) {
  const db = await database();
  if (!db) throw new Error("Очередь отправки недоступна");
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        const entry = request.result as MediaOutboxEntry | undefined;
        if (entry?.files[index]) {
          entry.files[index].uploaded = uploaded;
          store.put(entry);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function syncMediaUploads() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const withSync = registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
    await withSync.sync?.register("send-media").catch(() => {});
    registration.active?.postMessage({ type: "sync-media" });
  } catch {
    // Очередь останется в IndexedDB до следующего запуска или online.
  }
}
