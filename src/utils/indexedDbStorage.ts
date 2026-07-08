const DB_NAME = 'assetmaster-db';
const DB_VERSION = 1;
const STORE_NAME = 'records';

type StoredRecord<T> = {
  key: string;
  value: T;
  updatedAt: number;
};

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = handler(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
  });
};

export const getIndexedDbRecord = async <T>(key: string): Promise<T | null> => {
  const record = await withStore<StoredRecord<T> | undefined>('readonly', (store) => store.get(key));
  return record?.value ?? null;
};

export const setIndexedDbRecord = async <T>(key: string, value: T): Promise<void> => {
  await withStore('readwrite', (store) => store.put({
    key,
    value,
    updatedAt: Date.now(),
  } satisfies StoredRecord<T>));
};
