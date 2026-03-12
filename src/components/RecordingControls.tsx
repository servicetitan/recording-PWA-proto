import { useRecording } from '../context/RecordingContext';

export function RecordingControls() {
    const { recordingState, error, startRecording, pauseRecording, resumeRecording, stopRecording } = useRecording();

    return (
        <div className="recording-controls">
            {error && <div className="error-banner">{error}</div>}

            {recordingState === 'idle' && (
                <button className="btn btn-record" onClick={startRecording}>
                    <span className="btn-icon">●</span>
                    Start Recording
                </button>
            )}

            {recordingState === 'recording' && (
                <div className="btn-group">
                    <button className="btn btn-pause" onClick={pauseRecording}>
                        ⏸ Pause
                    </button>
                    <button className="btn btn-stop" onClick={stopRecording}>
                        ⏹ Stop
                    </button>
                </div>
            )}

            {recordingState === 'paused' && (
                <div className="btn-group">
                    <button className="btn btn-resume" onClick={resumeRecording}>
                        ▶ Resume
                    </button>
                    <button className="btn btn-stop" onClick={stopRecording}>
                        ⏹ Stop
                    </button>
                </div>
            )}
        </div>
    );
}
