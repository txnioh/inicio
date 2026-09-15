import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { LazyMotion } from 'framer-motion';
import App from './app/App';
import { GlobalAudioPlayerProvider } from './app/components/GlobalAudioPlayer';
import './app/globals.css';

const loadMotionFeatures = () => import('./app/motionFeatures').then(module => module.default);

const app = (
  <StrictMode>
    <LazyMotion features={loadMotionFeatures} strict>
      <GlobalAudioPlayerProvider>
        <App />
      </GlobalAudioPlayerProvider>
    </LazyMotion>
  </StrictMode>
);

const root = document.getElementById('root')!;
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
