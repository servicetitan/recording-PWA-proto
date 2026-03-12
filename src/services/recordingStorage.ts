import { openDB, type IDBPDatabase } from 'idb';
import type { RecordingMetadata, StoredRecording } from '../types/recording';

const DB_NAME = 'field-pro-recordings';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

function getDB(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt');
            }
        },
    });
}

export async function saveRecording(blob: Blob, metadata: RecordingMetadata): Promise<void> {
    const db = await getDB();
    const record: StoredRecording = { ...metadata, blob };
    await db.put(STORE_NAME, record);
}

export async function getRecording(id: string): Promise<StoredRecording | undefined> {
    const db = await getDB();
    return db.get(STORE_NAME, id);
}

export async function getAllRecordings(): Promise<StoredRecording[]> {
    const db = await getDB();
    const all = await db.getAll(STORE_NAME);
    return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteRecording(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
}

export async function checkStorageQuota(): Promise<{ usedMB: number; quotaMB: number; percentUsed: number } | null> {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const usedMB = Math.round(usage / (1024 * 1024));
    const quotaMB = Math.round(quota / (1024 * 1024));
    const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0;
    return { usedMB, quotaMB, percentUsed };
}
