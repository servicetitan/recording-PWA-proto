import { useRecording } from '../context/RecordingContext';

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export function StatusIndicator() {
    const { recordingState, duration } = useRecording();

    const statusConfig = {
        idle: { label: 'Ready', className: 'status-idle' },
        recording: { label: 'Recording', className: 'status-recording' },
        paused: { label: 'Paused', className: 'status-paused' },
        interrupted: { label: 'Reconnecting...', className: 'status-interrupted' },
    };

    const { label, className } = statusConfig[recordingState];

    return (
        <div className={`status-indicator ${className}`}>
            <span className="status-dot" />
            <span className="status-label">{label}</span>
            {recordingState !== 'idle' && <span className="status-time">{formatTime(duration)}</span>}
        </div>
    );
}
