import { render } from 'react-dom';

import { App } from './app';

const appContainer = document.createElement('div');
document.body.appendChild(appContainer);

render(<App />, appContainer);
