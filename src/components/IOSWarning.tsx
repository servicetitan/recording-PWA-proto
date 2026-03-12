import { useState } from 'react';
import { isIOSStandalone } from '../services/platformDetect';

export function IOSWarning() {
    const [dismissed, setDismissed] = useState(false);

    if (!isIOSStandalone() || dismissed) return null;

    return (
        <div className="ios-warning">
            <span>Audio recording may not work in standalone mode. If issues occur, open this URL in Safari.</span>
            <button className="btn-dismiss" onClick={() => setDismissed(true)} title="Dismiss">
                ✕
            </button>
        </div>
    );
}
