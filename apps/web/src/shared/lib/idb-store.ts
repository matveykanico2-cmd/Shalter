// Данные прошлого запуска, которым тесно в localStorage (ленты чатов): IndexedDB, одна
// база на устройство. Без IndexedDB (старый браузер, приватный режим, jsdom) всё молча
// пропускается — приложение просто открывается медленнее.
const DB_NAME = "shalter-cache";
// 2 — очередь исходящих (features/send-message, outbox).
const DB_VERSION = 2;
const STORES = ["histories", "outbox"] as const;

export type IdbStoreName = (typeof STORES)[number];

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        // Другая вкладка удаляет базу (выход) — отпускаем её.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Все записи хранилища с ключами (их немного: ленты кэшируются для нескольких десятков чатов). */
export async function idbEntries<T>(store: IdbStoreName): Promise<Array<[string, T]>> {
  try {
    const db = await open();
    if (!db) return [];
    const tx = db.transaction(store, "readonly").objectStore(store);
    const [keys, values] = await Promise.all([done(tx.getAllKeys()), done(tx.getAll())]);
    return keys.map((k, i) => [String(k), values[i] as T]);
  } catch {
    return [];
  }
}

export async function idbPut(store: IdbStoreName, key: string, value: unknown) {
  try {
    const db = await open();
    if (db) await done(db.transaction(store, "readwrite").objectStore(store).put(value, key));
  } catch {
    // место кончилось или база закрыта — без кэша
  }
}

export async function idbDelete(store: IdbStoreName, keys: readonly string[]) {
  if (!keys.length) return;
  try {
    const db = await open();
    if (!db) return;
    const tx = db.transaction(store, "readwrite").objectStore(store);
    await Promise.all(keys.map((k) => done(tx.delete(k))));
  } catch {
    // не вышло — удалим в следующий раз
  }
}

/** Выход и удаление аккаунта: переписка не должна остаться на устройстве. */
export function idbClear() {
  try {
    if (typeof indexedDB === "undefined") return;
    void open().then((db) => {
      db?.close();
      opening = null;
      indexedDB.deleteDatabase(DB_NAME);
    });
  } catch {
    // хранилище недоступно — и кэша нет
  }
}
