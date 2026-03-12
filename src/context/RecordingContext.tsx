import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { RecordingState, StoredRecording } from '../types/recording';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { getAllRecordings, deleteRecording as deleteFromDB } from '../services/recordingStorage';

interface RecordingContextValue {
    recordingState: RecordingState;
    duration: number;
    error: string | null;
    recordings: StoredRecording[];
    startRecording: () => Promise<void>;
    pauseRecording: () => void;
    resumeRecording: () => void;
    stopRecording: () => Promise<void>;
    deleteRecording: (id: string) => Promise<void>;
    refreshRecordings: () => Promise<void>;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function RecordingProvider({ children }: { children: ReactNode }) {
    const recorder = useAudioRecorder();
    const [recordings, setRecordings] = useState<StoredRecording[]>([]);

    const refreshRecordings = useCallback(async () => {
        const all = await getAllRecordings();
        setRecordings(all);
    }, []);

    // Load recordings on mount and after recording stops
    useEffect(() => {
        refreshRecordings();
    }, [refreshRecordings]);

    // Refresh list when recording stops (transitions to idle from non-idle)
    const prevStateRef = { current: recorder.recordingState };
    useEffect(() => {
        if (prevStateRef.current !== 'idle' && recorder.recordingState === 'idle') {
            refreshRecordings();
        }
        prevStateRef.current = recorder.recordingState;
    }, [recorder.recordingState, refreshRecordings]);

    const deleteRecording = useCallback(
        async (id: string) => {
            await deleteFromDB(id);
            await refreshRecordings();
        },
        [refreshRecordings]
    );

    return (
        <RecordingContext.Provider
            value={{
                ...recorder,
                recordings,
                deleteRecording,
                refreshRecordings,
            }}
        >
            {children}
        </RecordingContext.Provider>
    );
}

export function useRecording(): RecordingContextValue {
    const ctx = useContext(RecordingContext);
    if (!ctx) {
        throw new Error('useRecording must be used within a RecordingProvider');
    }
    return ctx;
}
