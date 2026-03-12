import { useState, useRef, useEffect } from 'react';
import { useRecording } from '../context/RecordingContext';
import type { StoredRecording } from '../types/recording';

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RecordingItem({ recording, onDelete }: { recording: StoredRecording; onDelete: (id: string) => void }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const urlRef = useRef<string | null>(null);

    useEffect(() => {
        return () => {
            if (urlRef.current) {
                URL.revokeObjectURL(urlRef.current);
            }
        };
    }, []);

    const togglePlayback = () => {
        if (!audioRef.current) {
            const url = URL.createObjectURL(recording.blob);
            urlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;

            audio.onended = () => setIsPlaying(false);
            audio.onpause = () => setIsPlaying(false);
            audio.onplay = () => setIsPlaying(true);
        }

        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
    };

    return (
        <div className="recording-item">
            <button className="btn-icon-only" onClick={togglePlayback} title={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? '⏸' : '▶'}
            </button>
            <div className="recording-info">
                <span className="recording-date">{formatDate(recording.createdAt)}</span>
                <span className="recording-meta">
                    {formatTime(recording.duration)} · {formatSize(recording.sizeBytes)}
                </span>
            </div>
            <button className="btn-icon-only btn-delete" onClick={() => onDelete(recording.id)} title="Delete">
                ✕
            </button>
        </div>
    );
}

export function RecordingList() {
    const { recordings, deleteRecording } = useRecording();

    if (recordings.length === 0) {
        return <p className="empty-state">No recordings yet</p>;
    }

    return (
        <div className="recording-list">
            <h2>Saved Recordings</h2>
            {recordings.map((rec) => (
                <RecordingItem key={rec.id} recording={rec} onDelete={deleteRecording} />
            ))}
        </div>
    );
}
