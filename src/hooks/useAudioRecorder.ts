import { useState, useRef, useEffect, useCallback } from 'react';
import type { RecordingState, RecordingMetadata } from '../types/recording';
import { getSupportedMimeType, isIOSStandalone, isMediaRecorderSupported } from '../services/platformDetect';
import { saveRecording } from '../services/recordingStorage';

interface UseAudioRecorderReturn {
    recordingState: RecordingState;
    duration: number;
    error: string | null;
    startRecording: () => Promise<void>;
    pauseRecording: () => void;
    resumeRecording: () => void;
    stopRecording: () => Promise<void>;
}

function generateId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatError(err: unknown): string {
    if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
            return 'Microphone permission denied. Please allow access in your browser settings.';
        }
        if (err.name === 'NotFoundError') {
            return 'No microphone found on this device.';
        }
    }
    if (isIOSStandalone()) {
        return 'Recording may not work in this mode. Try opening the URL directly in Safari.';
    }
    return `Unable to start recording: ${err instanceof Error ? err.message : String(err)}`;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
    const [recordingState, setRecordingState] = useState<RecordingState>('idle');
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mimeTypeRef = useRef<string>('');
    const recordingIdRef = useRef<string>('');
    const startTimeRef = useRef<number>(0);
    const pausedDurationRef = useRef<number>(0);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearTimer();
            stopStream();
        };
    }, [clearTimer, stopStream]);

    const startRecording = useCallback(async () => {
        setError(null);

        if (!isMediaRecorderSupported()) {
            setError('Audio recording is not supported in this browser.');
            return;
        }

        const mimeType = getSupportedMimeType();
        if (!mimeType) {
            setError('No supported audio format found in this browser.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            mimeTypeRef.current = mimeType;
            chunksRef.current = [];
            recordingIdRef.current = generateId();

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onerror = () => {
                setError('An error occurred during recording.');
                setRecordingState('idle');
                clearTimer();
                stopStream();
            };

            recorder.start(1000); // Collect data every second
            startTimeRef.current = Date.now();
            pausedDurationRef.current = 0;
            setDuration(0);
            setRecordingState('recording');

            timerRef.current = setInterval(() => {
                const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current;
                setDuration(Math.floor(elapsed / 1000));
            }, 200);
        } catch (err) {
            stopStream();
            setError(formatError(err));
        }
    }, [clearTimer, stopStream]);

    const pauseRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state === 'recording') {
            recorder.pause();
            clearTimer();
            // Track when we paused
            (pauseRecording as unknown as { _pauseStart?: number })._pauseStart = Date.now();
            setRecordingState('paused');
        }
    }, [clearTimer]);

    const resumeRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state === 'paused') {
            const pauseStart = (pauseRecording as unknown as { _pauseStart?: number })._pauseStart;
            if (pauseStart) {
                pausedDurationRef.current += Date.now() - pauseStart;
            }
            recorder.resume();
            setRecordingState('recording');

            timerRef.current = setInterval(() => {
                const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current;
                setDuration(Math.floor(elapsed / 1000));
            }, 200);
        }
    }, [pauseRecording]);

    const stopRecording = useCallback(async () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === 'inactive') return;

        return new Promise<void>((resolve) => {
            recorder.onstop = async () => {
                clearTimer();
                const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
                const finalDuration = Math.floor(
                    (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000
                );

                const metadata: RecordingMetadata = {
                    id: recordingIdRef.current,
                    createdAt: Date.now(),
                    duration: finalDuration,
                    mimeType: mimeTypeRef.current,
                    sizeBytes: blob.size,
                    uploaded: false,
                };

                try {
                    await saveRecording(blob, metadata);
                } catch (err) {
                    setError(`Failed to save recording: ${err instanceof Error ? err.message : String(err)}`);
                }

                stopStream();
                chunksRef.current = [];
                mediaRecorderRef.current = null;
                setDuration(finalDuration);
                setRecordingState('idle');
                resolve();
            };

            recorder.stop();
        });
    }, [clearTimer, stopStream]);

    return {
        recordingState,
        duration,
        error,
        startRecording,
        pauseRecording,
        resumeRecording,
        stopRecording,
    };
}
