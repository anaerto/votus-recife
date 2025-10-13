// Client-side cache utilities for candidate analysis results
// Prefer IndexedDB, with localStorage fallback

const DB_NAME = 'votus-cache';
const STORE_NAME = 'candidateResults';
const DB_VERSION = 1;

type CachedRecord<T = any> = {
  id: string;
  version?: string;
  updatedAt: number;
  payload: T;
};

function hasIndexedDB() {
  return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

export async function loadResult<T = any>(id: string, version?: string, maxAgeMs?: number): Promise<T | null> {
  // IndexedDB preferred
  if (hasIndexedDB()) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const value: CachedRecord<T> | null = await new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve((req.result as any) ?? null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (!value) return null;
      if (version && value.version && value.version !== version) return null;
      if (maxAgeMs && Date.now() - value.updatedAt > maxAgeMs) return null;
      return value.payload;
    } catch {
      // fall through to localStorage
    }
  }
  // Fallback: localStorage MVP
  try {
    const raw = localStorage.getItem(id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRecord<T>;
    if (version && parsed.version && parsed.version !== version) return null;
    if (maxAgeMs && Date.now() - parsed.updatedAt > maxAgeMs) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

export async function saveResult<T = any>(id: string, data: T, version?: string): Promise<void> {
  const record: CachedRecord<T> = {
    id,
    version,
    updatedAt: Date.now(),
    payload: data,
  };
  if (hasIndexedDB()) {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      db.close();
      return;
    } catch {
      // fall through to localStorage
    }
  }
  try {
    localStorage.setItem(id, JSON.stringify(record));
  } catch {
    // ignore
  }
}

export async function clearByVersion(version: string): Promise<void> {
  if (hasIndexedDB()) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result as IDBCursorWithValue | null;
          if (!cursor) return resolve();
          const val = cursor.value as CachedRecord<any>;
          if (val.version && val.version !== version) {
            store.delete(cursor.primaryKey as any);
          }
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });
      db.close();
      return;
    } catch {
      // fall through to localStorage
    }
  }
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (!k.startsWith('candidato_analise_')) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as CachedRecord<any>;
        if (parsed.version && parsed.version !== version) {
          localStorage.removeItem(k);
        }
      } catch {}
    }
  } catch {}
}