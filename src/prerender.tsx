import { renderToString } from 'react-dom/server';
import { domMax, LazyMotion } from 'framer-motion';
import { Home } from './app/App';
import { GlobalAudioPlayerProvider } from './app/components/GlobalAudioPlayer';

export function renderHome() {
  return renderToString(
    <LazyMotion features={domMax} strict>
      <GlobalAudioPlayerProvider>
        <Home arrived={false} />
      </GlobalAudioPlayerProvider>
    </LazyMotion>,
  );
}
