import { useCallback, useEffect, useState } from 'react';
import InfiniteGrid from './InfiniteGrid';
import MediaViewer from './MediaViewer';
import OrbitLens from './OrbitLens';
import EffectSettings from './EffectSettings';
import { collection, loadImage, loadMedia, type LoadedMedia } from './media';
import { readSettings, SETTINGS_KEY } from './settings';
import './carrete.css';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

export default function Carrete() {
  const reducedMotion = useReducedMotion();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedMedia[]>([]);
  const [previews, setPreviews] = useState<LoadedMedia[]>([]);
  const [failed, setFailed] = useState(0);
  const [entered, setEntered] = useState(false);
  const [introVisible, setIntroVisible] = useState(true);
  const [selected, setSelected] = useState<{ index: number; source: HTMLButtonElement } | null>(null);
  const [settings, setSettings] = useState(readSettings);
  const [orbitReplay, setOrbitReplay] = useState(0);
  const [gridReplay, setGridReplay] = useState(0);
  const open = useCallback((index: number, source: HTMLButtonElement) => setSelected({ index, source }), []);
  const close = useCallback(() => setSelected(null), []);
  const settled = loaded.length + failed === collection.length;
  const showIntro = () => {
    setEntered(false);
    setIntroVisible(true);
    setOrbitReplay(value => value + 1);
  };
  const replay = () => {
    if (entered) setGridReplay(value => value + 1);
    else setOrbitReplay(value => value + 1);
  };
  const ordered = collection.flatMap(item => {
    const full = loaded.find(media => media.item.id === item.id);
    return full ? [full] : [];
  });
  const frames = collection.flatMap(item => {
    const frame = loaded.find(media => media.item.id === item.id) ?? previews.find(media => media.item.id === item.id);
    return frame ? [frame] : [];
  });

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
    catch { /* Effects remain adjustable when browser storage is unavailable. */ }
  }, [settings]);

  useEffect(() => {
    const title = document.title;
    const lang = document.documentElement.lang;
    document.title = 'Carrete · txnio';
    document.documentElement.lang = 'es';
    return () => { document.title = title; document.documentElement.lang = lang; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const resources: LoadedMedia[] = [];
    setLoaded([]);
    setFailed(0);
    void Promise.all(collection.map(async item => {
      try { return { item, image: await loadImage(item.preview, controller.signal) }; }
      catch { return null; }
    })).then(results => {
      if (!controller.signal.aborted) setPreviews(results.filter((item): item is LoadedMedia => item !== null));
    });
    // Four downloads at a time keep larger collections from saturating the connection.
    let cursor = 0;
    async function worker() {
      while (cursor < collection.length && !controller.signal.aborted) {
        const item = collection[cursor++];
        try {
          const media = await loadMedia(item, controller.signal);
          if (controller.signal.aborted) {
            if (media.videoUrl) URL.revokeObjectURL(media.videoUrl);
            return;
          }
          resources.push(media);
          setLoaded(current => [...current, media]);
        } catch {
          if (!controller.signal.aborted) setFailed(current => current + 1);
        }
      }
    }
    for (let index = 0; index < Math.min(4, collection.length); index++) void worker();
    return () => {
      controller.abort();
      resources.forEach(media => { if (media.videoUrl) URL.revokeObjectURL(media.videoUrl); });
    };
  }, [attempt]);

  useEffect(() => {
    if (!entered) return;
    const timer = window.setTimeout(() => setIntroVisible(false), reducedMotion ? 0 : 180);
    if (!document.getElementById('carrete-settings')?.matches(':popover-open')) {
      document.querySelector<HTMLElement>('.carrete-grid')?.focus({ preventScroll: true });
    }
    return () => clearTimeout(timer);
  }, [entered, reducedMotion]);

  return <main className={`carrete-page${entered ? ' has-entered' : ''}${selected ? ' has-viewer' : ''}`} tabIndex={-1}>
    <header className="carrete-header">
      <div className="carrete-heading">
        <h1 className="carrete-title">Carrete</h1>
        {entered && <span className="carrete-count">{String(loaded.length).padStart(2, '0')}</span>}
      </div>
      <nav className="carrete-header-actions" aria-label="Carrete">
        <button className="minimal-basic-link carrete-text-button" popoverTarget="carrete-settings" aria-haspopup="dialog">Ajustes</button>
        <a className="minimal-basic-link" href="/">Volver a inicio</a>
      </nav>
    </header>

    {entered && <div className="carrete-explore">
      <InfiniteGrid media={ordered} reducedMotion={reducedMotion}
        settings={settings} replay={gridReplay} onOpen={open} />
    </div>}

    {introVisible && <section className="carrete-intro" aria-label="Cargar el carrete" inert={entered}>
      <OrbitLens key={orbitReplay} frames={frames} reducedMotion={reducedMotion} settings={settings} />
      <div className="carrete-intro-center">
        <div className="carrete-enter-slot">
          <button className="carrete-text-button carrete-enter"
            disabled={!settled || !loaded.length} onClick={() => setEntered(true)}>
            <span>{settled && loaded.length ? 'Enter' : 'Preparing…'}</span>
            <span className="carrete-enter-arrow" aria-hidden="true">→</span>
          </button>
        </div>
        {settled && failed > 0 && <div className="carrete-load-error" role="status">
          <p>{failed === 1 ? 'Una pieza no se ha podido cargar.' : `${failed} piezas no se han podido cargar.`}</p>
          <button className="minimal-basic-link carrete-text-button" onClick={() => setAttempt(value => value + 1)}>Reintentar</button>
          {loaded.length > 0 && <span>Puedes entrar con las {loaded.length} disponibles.</span>}
        </div>}
        {collection.length === 0 && <p className="carrete-empty">El carrete está vacío.</p>}
        <span className="carrete-sr-only" role="status">{settled
          ? loaded.length ? `${loaded.length} piezas listas. Ya puedes entrar.` : 'No hay piezas disponibles.'
          : 'Preparando el carrete.'}</span>
      </div>
      <footer className="carrete-intro-footer">
        <span>Fotografía & vídeo</span>
        <span>Archivo de muestra · {String(collection.length).padStart(2, '0')}</span>
      </footer>
    </section>}

    <EffectSettings settings={settings} setSettings={setSettings} entered={entered}
      canEnter={settled && loaded.length > 0} reducedMotion={reducedMotion}
      onIntro={showIntro} onGrid={() => setEntered(true)} onReplay={replay} />
    {selected !== null && <MediaViewer media={ordered} initialIndex={selected.index}
      initialSource={selected.source} reducedMotion={reducedMotion} onClose={close} />}
  </main>;
}
