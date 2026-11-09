/**
 * Устойчивая очередь уже подготовленных сообщений. Файлы к этому моменту загружены, поэтому
 * в IndexedDB лежат только JSON и ссылки /uploads. Эту же базу читает public/sw.js.
 */
export type MessageOutboxEntry = {
  id: string;
  chatId: string;
  path: string;
  body: Record<string, unknown>;
  createdAt: number;
};

const DB_NAME = "shalter-outbox";
const STORE = "messages";

function database() {
  if (typeof indexedDB === "undefined") return Promise.resolve<IDBDatabase | null>(null);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
}

async function write(mode: IDBTransactionMode, run: (store: IDBObjectStore) => void) {
  const db = await database();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    run(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }).catch(() => {});
  db.close();
}

export const keepOutgoingMessage = (entry: MessageOutboxEntry) => write("readwrite", (store) => store.put(entry));

export const forgetOutgoingMessage = (id: string) => write("readwrite", (store) => store.delete(id));

/** Просим SW отправить очередь сейчас; Background Sync используется, когда он доступен. */
export async function syncOutgoingMessages() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const withSync = registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
    await withSync.sync?.register("send-messages");
    registration.active?.postMessage({ type: "sync-messages" });
  } catch {
    // Очередь останется в IndexedDB и будет поднята при следующем запуске/online.
  }
}
