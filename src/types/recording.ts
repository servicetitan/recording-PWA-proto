export type RecordingState = 'idle' | 'recording' | 'paused';

export interface RecordingMetadata {
    id: string;
    createdAt: number;
    duration: number;
    mimeType: string;
    sizeBytes: number;
    uploaded: boolean;
}

export interface StoredRecording extends RecordingMetadata {
    blob: Blob;
}
