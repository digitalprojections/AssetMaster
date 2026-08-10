import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {warmUpPlayIntegrity} from './utils/playIntegrity';
import './index.css';

void warmUpPlayIntegrity().catch((error) => {
  console.info('Play Integrity warm-up skipped or failed.', error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
