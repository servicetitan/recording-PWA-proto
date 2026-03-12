export type RecordingState = 'idle' | 'recording' | 'paused' | 'interrupted';

export interface AudioGap {
    startSec: number;
    endSec: number;
}

export interface RecordingMetadata {
    id: string;
    createdAt: number;
    duration: number;
    mimeType: string;
    sizeBytes: number;
    uploaded: boolean;
    gaps?: AudioGap[];
}

export interface StoredRecording extends RecordingMetadata {
    blob: Blob;
}
