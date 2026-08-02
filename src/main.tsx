import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { GlobalAudioPlayerProvider } from './app/components/GlobalAudioPlayer';
import './app/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalAudioPlayerProvider>
      <App />
    </GlobalAudioPlayerProvider>
  </StrictMode>,
);
