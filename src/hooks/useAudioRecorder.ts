import { useState, useRef, useEffect, useCallback } from 'react';
import type { RecordingState, RecordingMetadata, AudioGap } from '../types/recording';
import { getSupportedMimeType, isIOSStandalone, isMediaRecorderSupported } from '../services/platformDetect';
import { saveRecording, saveChunks, getChunks, clearChunks } from '../services/recordingStorage';

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
    const pauseStartRef = useRef<number>(0);

    // Background resilience refs
    const segmentIndexRef = useRef<number>(0);
    const backgroundGapsRef = useRef<AudioGap[]>([]);
    const backgroundGapDurationRef = useRef<number>(0);
    const gapStartTimeRef = useRef<number>(0);
    const wasRecordingBeforeHiddenRef = useRef<boolean>(false);
    const wasPausedBeforeHiddenRef = useRef<boolean>(false);
    const isResumingRef = useRef<boolean>(false);
    // Track the actual state via ref so visibility handler always has current value
    const recordingStateRef = useRef<RecordingState>('idle');

    // Keep state ref in sync
    useEffect(() => {
        recordingStateRef.current = recordingState;
    }, [recordingState]);

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

    const startDurationTimer = useCallback(() => {
        clearTimer();
        timerRef.current = setInterval(() => {
            const elapsed =
                Date.now() -
                startTimeRef.current -
                pausedDurationRef.current -
                backgroundGapDurationRef.current;
            setDuration(Math.floor(elapsed / 1000));
        }, 200);
    }, [clearTimer]);

    // Create a new MediaRecorder on the given stream and start collecting chunks
    const startMediaRecorder = useCallback(
        (stream: MediaStream, mimeType: string) => {
            chunksRef.current = [];
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

            recorder.start(1000);
            startDurationTimer();
        },
        [clearTimer, stopStream, startDurationTimer]
    );

    // Flush in-memory chunks to IndexedDB
    const persistChunks = useCallback(async () => {
        if (chunksRef.current.length === 0) return;
        const id = recordingIdRef.current;
        const segment = segmentIndexRef.current;
        const blobsToSave = [...chunksRef.current];
        chunksRef.current = [];
        await saveChunks(id, blobsToSave, segment);
    }, []);

    // --- Visibility change handler for background resilience ---
    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'hidden') {
                const currentState = recordingStateRef.current;
                if (currentState === 'recording') {
                    wasRecordingBeforeHiddenRef.current = true;
                    wasPausedBeforeHiddenRef.current = false;

                    // Flush pending data from MediaRecorder
                    const recorder = mediaRecorderRef.current;
                    if (recorder && recorder.state === 'recording') {
                        try {
                            recorder.requestData();
                        } catch {
                            // requestData may throw if recorder is in a bad state
                        }
                    }

                    // Persist chunks to IndexedDB
                    await persistChunks();

                    // Stop the recorder and stream (OS may kill them anyway)
                    clearTimer();
                    if (recorder && recorder.state !== 'inactive') {
                        try {
                            recorder.stop();
                        } catch {
                            // ignore
                        }
                    }
                    stopStream();
                    mediaRecorderRef.current = null;

                    // Record when the gap started
                    gapStartTimeRef.current = Date.now();
                } else if (currentState === 'paused') {
                    wasPausedBeforeHiddenRef.current = true;
                    wasRecordingBeforeHiddenRef.current = false;

                    // Save what we have
                    await persistChunks();

                    // Stop recorder and stream
                    const recorder = mediaRecorderRef.current;
                    clearTimer();
                    if (recorder && recorder.state !== 'inactive') {
                        try {
                            recorder.stop();
                        } catch {
                            // ignore
                        }
                    }
                    stopStream();
                    mediaRecorderRef.current = null;

                    gapStartTimeRef.current = Date.now();
                }
            } else if (document.visibilityState === 'visible') {
                if (isResumingRef.current) return; // guard against rapid toggles

                if (wasRecordingBeforeHiddenRef.current) {
                    wasRecordingBeforeHiddenRef.current = false;
                    isResumingRef.current = true;

                    // Calculate gap
                    const gapStart = gapStartTimeRef.current;
                    const gapEnd = Date.now();
                    const gapMs = gapEnd - gapStart;
                    backgroundGapDurationRef.current += gapMs;

                    const gapStartSec = Math.floor(
                        (gapStart - startTimeRef.current - pausedDurationRef.current - (backgroundGapDurationRef.current - gapMs)) / 1000
                    );
                    backgroundGapsRef.current.push({
                        startSec: gapStartSec,
                        endSec: gapStartSec, // gap content is lost, so start=end in recording time
                    });

                    setRecordingState('interrupted');

                    try {
                        // Re-acquire microphone
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        streamRef.current = stream;

                        // New segment
                        segmentIndexRef.current += 1;

                        // Start new MediaRecorder
                        startMediaRecorder(stream, mimeTypeRef.current);
                        setRecordingState('recording');
                    } catch (err) {
                        // If mic re-acquisition fails, save what we have
                        setError(
                            `Could not reconnect microphone: ${err instanceof Error ? err.message : String(err)}. Recording saved with gap.`
                        );
                        setRecordingState('idle');
                    } finally {
                        isResumingRef.current = false;
                    }
                } else if (wasPausedBeforeHiddenRef.current) {
                    wasPausedBeforeHiddenRef.current = false;

                    // Track the gap in pause time (already paused, so add to paused duration)
                    const gapMs = Date.now() - gapStartTimeRef.current;
                    pausedDurationRef.current += gapMs;

                    // Re-acquire mic but stay paused — we need a live stream to resume from
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        streamRef.current = stream;
                        segmentIndexRef.current += 1;

                        chunksRef.current = [];
                        const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
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

                        // Start then immediately pause to have a resumable recorder
                        recorder.start(1000);
                        recorder.pause();
                        // State stays 'paused'
                    } catch (err) {
                        setError(
                            `Could not reconnect microphone: ${err instanceof Error ? err.message : String(err)}`
                        );
                        setRecordingState('idle');
                    }
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        // iOS fallback events
        window.addEventListener('pagehide', () => {
            if (recordingStateRef.current === 'recording' || recordingStateRef.current === 'paused') {
                handleVisibilityChange();
            }
        });

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [clearTimer, stopStream, startMediaRecorder, persistChunks]);

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
            segmentIndexRef.current = 0;
            backgroundGapsRef.current = [];
            backgroundGapDurationRef.current = 0;
            wasRecordingBeforeHiddenRef.current = false;
            wasPausedBeforeHiddenRef.current = false;

            startTimeRef.current = Date.now();
            pausedDurationRef.current = 0;
            setDuration(0);

            startMediaRecorder(stream, mimeType);
            setRecordingState('recording');
        } catch (err) {
            stopStream();
            setError(formatError(err));
        }
    }, [stopStream, startMediaRecorder]);

    const pauseRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state === 'recording') {
            recorder.pause();
            clearTimer();
            pauseStartRef.current = Date.now();
            setRecordingState('paused');
        }
    }, [clearTimer]);

    const resumeRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state === 'paused') {
            if (pauseStartRef.current) {
                pausedDurationRef.current += Date.now() - pauseStartRef.current;
                pauseStartRef.current = 0;
            }
            recorder.resume();
            setRecordingState('recording');
            startDurationTimer();
        }
    }, [startDurationTimer]);

    const stopRecording = useCallback(async () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === 'inactive') {
            // No active recorder — but we may have persisted chunks from a background save.
            // Assemble whatever we have.
            const recordingId = recordingIdRef.current;
            if (!recordingId) return;

            const persistedChunks = await getChunks(recordingId);
            if (persistedChunks.length === 0) return;

            const blob = new Blob(persistedChunks, { type: mimeTypeRef.current });
            const finalDuration = Math.floor(
                (Date.now() - startTimeRef.current - pausedDurationRef.current - backgroundGapDurationRef.current) / 1000
            );

            const metadata: RecordingMetadata = {
                id: recordingId,
                createdAt: Date.now(),
                duration: finalDuration,
                mimeType: mimeTypeRef.current,
                sizeBytes: blob.size,
                uploaded: false,
                gaps: backgroundGapsRef.current.length > 0 ? backgroundGapsRef.current : undefined,
            };

            try {
                await saveRecording(blob, metadata);
            } catch (err) {
                setError(`Failed to save recording: ${err instanceof Error ? err.message : String(err)}`);
            }

            await clearChunks(recordingId);
            clearTimer();
            setDuration(finalDuration);
            setRecordingState('idle');
            return;
        }

        return new Promise<void>((resolve) => {
            recorder.onstop = async () => {
                clearTimer();

                // Persist any remaining in-memory chunks
                await persistChunks();

                // Assemble all chunks from IndexedDB
                const recordingId = recordingIdRef.current;
                const allChunks = await getChunks(recordingId);

                // Also include any chunks still in memory (from current segment after persistChunks)
                // persistChunks clears chunksRef, so allChunks from DB should be complete.

                const blob = new Blob(allChunks, { type: mimeTypeRef.current });
                const finalDuration = Math.floor(
                    (Date.now() - startTimeRef.current - pausedDurationRef.current - backgroundGapDurationRef.current) / 1000
                );

                const metadata: RecordingMetadata = {
                    id: recordingId,
                    createdAt: Date.now(),
                    duration: finalDuration,
                    mimeType: mimeTypeRef.current,
                    sizeBytes: blob.size,
                    uploaded: false,
                    gaps: backgroundGapsRef.current.length > 0 ? backgroundGapsRef.current : undefined,
                };

                try {
                    await saveRecording(blob, metadata);
                } catch (err) {
                    setError(`Failed to save recording: ${err instanceof Error ? err.message : String(err)}`);
                }

                await clearChunks(recordingId);
                stopStream();
                chunksRef.current = [];
                mediaRecorderRef.current = null;
                setDuration(finalDuration);
                setRecordingState('idle');
                resolve();
            };

            recorder.stop();
        });
    }, [clearTimer, stopStream, persistChunks]);

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
