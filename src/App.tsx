import { RecordingProvider } from './context/RecordingContext';
import { IOSWarning } from './components/IOSWarning';
import { StatusIndicator } from './components/StatusIndicator';
import { RecordingControls } from './components/RecordingControls';
import { RecordingList } from './components/RecordingList';
import './App.css';

function App() {
    return (
        <RecordingProvider>
            <div className="app">
                <header className="app-header">
                    <h1>Field Pro Recorder</h1>
                </header>
                <IOSWarning />
                <main className="app-main">
                    <StatusIndicator />
                    <RecordingControls />
                    <RecordingList />
                </main>
            </div>
        </RecordingProvider>
    );
}

export default App;
