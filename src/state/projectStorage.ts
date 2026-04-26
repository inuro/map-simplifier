import {
  projectSnapshotByteSize,
  type ProjectSnapshot,
} from "./projectSnapshot";

const DB_NAME = "map-simplifier";
const DB_VERSION = 1;
const STORE_NAME = "project-snapshots";

export interface SavedProjectEntry {
  id: string;
  label: string;
  savedAt: string;
  bytes: number;
}

interface SavedProjectRecord extends SavedProjectEntry {
  snapshot: ProjectSnapshot;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB が利用できません"));
  }

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction failed"));
        };
      }),
  );
}

export async function saveProjectSnapshot(
  snapshot: ProjectSnapshot,
): Promise<SavedProjectEntry> {
  const bytes = projectSnapshotByteSize(snapshot);
  const record: SavedProjectRecord = {
    id: newId(),
    label: snapshot.label,
    savedAt: snapshot.savedAt,
    bytes,
    snapshot,
  };
  await withStore("readwrite", (store) => store.put(record));
  return {
    id: record.id,
    label: record.label,
    savedAt: record.savedAt,
    bytes: record.bytes,
  };
}

export async function listProjectSnapshots(): Promise<SavedProjectEntry[]> {
  const records = (await withStore("readonly", (store) => store.getAll())) as SavedProjectRecord[];
  return records
    .map((r) => ({
      id: r.id,
      label: r.label,
      savedAt: r.savedAt,
      bytes: r.bytes,
    }))
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

export async function loadProjectSnapshot(id: string): Promise<ProjectSnapshot | null> {
  const record = (await withStore("readonly", (store) => store.get(id))) as
    | SavedProjectRecord
    | undefined;
  return record?.snapshot ?? null;
}
