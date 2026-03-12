import { openDB, type IDBPDatabase } from 'idb';
import type { RecordingMetadata, StoredRecording } from '../types/recording';

const DB_NAME = 'field-pro-recordings';
const DB_VERSION = 2;
const STORE_NAME = 'recordings';
const CHUNKS_STORE = 'chunks';

interface StoredChunk {
    id?: number; // auto-increment
    recordingId: string;
    segmentIndex: number;
    chunkIndex: number;
    blob: Blob;
}

function getDB(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            if (oldVersion < 1) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt');
            }
            if (oldVersion < 2) {
                const chunksStore = db.createObjectStore(CHUNKS_STORE, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                chunksStore.createIndex('recordingId', 'recordingId');
            }
        },
    });
}

// --- Recordings (complete) ---

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

// --- Chunks (in-progress recording segments) ---

export async function saveChunks(recordingId: string, blobs: Blob[], segmentIndex: number): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(CHUNKS_STORE, 'readwrite');
    for (let i = 0; i < blobs.length; i++) {
        await tx.store.add({
            recordingId,
            segmentIndex,
            chunkIndex: i,
            blob: blobs[i],
        } satisfies Omit<StoredChunk, 'id'>);
    }
    await tx.done;
}

export async function getChunks(recordingId: string): Promise<Blob[]> {
    const db = await getDB();
    const index = db.transaction(CHUNKS_STORE, 'readonly').store.index('recordingId');
    const all: StoredChunk[] = await index.getAll(recordingId);
    // Sort by segment then chunk index to maintain order
    all.sort((a, b) => a.segmentIndex - b.segmentIndex || a.chunkIndex - b.chunkIndex);
    return all.map((c) => c.blob);
}

export async function clearChunks(recordingId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(CHUNKS_STORE, 'readwrite');
    const index = tx.store.index('recordingId');
    let cursor = await index.openCursor(recordingId);
    while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
    }
    await tx.done;
}

// --- Storage quota ---

export async function checkStorageQuota(): Promise<{ usedMB: number; quotaMB: number; percentUsed: number } | null> {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const usedMB = Math.round(usage / (1024 * 1024));
    const quotaMB = Math.round(quota / (1024 * 1024));
    const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0;
    return { usedMB, quotaMB, percentUsed };
}
