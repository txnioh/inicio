import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import InfiniteGrid from './InfiniteGrid';
import MediaViewer from './MediaViewer';
import OrbitLens from './OrbitLens';
import EffectSettings from './EffectSettings';
import QualitySelector from './QualitySelector';
import { useMediaQuality } from './quality';
import NowPlaying from '../components/NowPlaying';
import { collection, loadImage, loadMedia, type LoadedMedia } from './media';
import { defaultSettings, readSettings, SETTINGS_KEY } from './settings';
import './carrete.css';

const canConfigure = import.meta.env.DEV
  && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

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
  const playerSlot = useRef<HTMLDivElement>(null);
  const [playerHost] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    playerSlot.current!.append(playerHost);
    return () => playerHost.remove();
  }, [playerHost]);

  const reducedMotion = useReducedMotion();
  const quality = useMediaQuality();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedMedia[]>([]);
  const [previews, setPreviews] = useState<LoadedMedia[]>([]);
  const [failed, setFailed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState(false);
  const [introVisible, setIntroVisible] = useState(true);
  const [selected, setSelected] = useState<{ index: number; source: HTMLButtonElement } | null>(null);
  const videoPositions = useRef(new Map<string, number>()).current;
  const [settings, setSettings] = useState(() => canConfigure ? readSettings() : { ...defaultSettings });
  const [orbitReplay, setOrbitReplay] = useState(0);
  const [gridReplay, setGridReplay] = useState(0);
  const open = useCallback((index: number, source: HTMLButtonElement) => setSelected({ index, source }), []);
  const close = useCallback(() => setSelected(null), []);
  const navigate = useCallback((index: number) => {
    setSelected(current => current ? { ...current, index } : current);
  }, []);
  const retainSource = useCallback((source: HTMLButtonElement) => {
    setSelected(current => current && current.source !== source ? { ...current, source } : current);
  }, []);
  const settled = !loading;
  const previousMedia = useRef(loaded);
  previousMedia.current = loaded;
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
    if (!canConfigure) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
    catch { /* Effects remain adjustable when browser storage is unavailable. */ }
  }, [settings]);

  useEffect(() => {
    const title = document.title;
    const lang = document.documentElement.lang;
    document.title = 'Camera roll · txnio';
    document.documentElement.lang = 'en';
    return () => { document.title = title; document.documentElement.lang = lang; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(collection.map(async item => {
      try { return { item, image: await loadImage(item.preview, controller.signal) }; }
      catch { return null; }
    })).then(results => {
      if (!controller.signal.aborted) setPreviews(results.filter((item): item is LoadedMedia => item !== null));
    });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(0);
    const results = new Map<string, LoadedMedia>();
    let failures = 0;
    let cursor = 0;
    async function worker() {
      while (cursor < collection.length && !controller.signal.aborted) {
        const item = collection[cursor++];
        try {
          const media = await loadMedia(item, controller.signal, quality.resolved);
          if (controller.signal.aborted) return;
          results.set(item.id, media);
        } catch {
          if (!controller.signal.aborted) failures++;
        }
      }
    }
    // Swap decoded images together, retaining the open item and old images if
    // an upgrade fails. Aborting a quality change also cancels its downloads.
    void Promise.all(Array.from({ length: quality.resolved === 'lite' ? 2 : 4 }, worker)).then(() => {
      if (controller.signal.aborted) return;
      const previous = previousMedia.current;
      const next = collection.flatMap(item => {
        const media = results.get(item.id) ?? previous.find(media => media.item.id === item.id);
        return media ? [media] : [];
      });
      setSelected(current => {
        if (!current) return current;
        const id = previous[current.index]?.item.id;
        const index = next.findIndex(media => media.item.id === id);
        return index < 0 ? null : { ...current, index };
      });
      setLoaded(next);
      setFailed(failures);
      setLoading(false);
    });
    return () => controller.abort();
  }, [attempt, quality.resolved]);

  useEffect(() => {
    if (!entered) return;
    const timer = window.setTimeout(() => setIntroVisible(false), reducedMotion ? 0 : 180);
    if (!document.getElementById('carrete-settings')?.matches(':popover-open')) {
      document.querySelector<HTMLElement>('.carrete-grid')?.focus({ preventScroll: true });
    }
    return () => clearTimeout(timer);
  }, [entered, reducedMotion]);

  return <main className={`carrete-page${entered ? ' has-entered' : ''}${selected ? ' has-viewer' : ''}`} tabIndex={-1} data-quality={quality.resolved}>
    <header className="carrete-header">
      {entered && <div className="carrete-heading">
        <h1 className="carrete-title">Camera roll</h1>
        <span className="carrete-count">{String(loaded.length).padStart(2, '0')}</span>
      </div>}
      <nav className="carrete-header-actions" aria-label="Camera roll">
        <QualitySelector quality={quality} />
        {canConfigure && <button className="minimal-basic-link carrete-text-button" popoverTarget="carrete-settings" aria-haspopup="dialog">Settings</button>}
        <a className="minimal-basic-link" href="/">Back home</a>
      </nav>
    </header>

    {entered && <div className="carrete-explore">
      <InfiniteGrid media={ordered} reducedMotion={reducedMotion} quality={quality.resolved}
        settings={settings} replay={gridReplay} onOpen={open}
        selection={selected} videoPositions={videoPositions} />
    </div>}

    {introVisible && <section className="carrete-intro" aria-label="Load camera roll" inert={entered}>
      <OrbitLens key={orbitReplay} frames={frames} reducedMotion={reducedMotion} settings={settings} quality={quality.resolved} />
      <button className="carrete-intro-trigger" aria-label="Open camera roll" aria-describedby="carrete-entry-hint"
        disabled={!settled || !loaded.length} onClick={() => setEntered(true)} />
      <div className="carrete-intro-center">
        <h1>Camera roll</h1>
        <p id="carrete-entry-hint" className="carrete-entry-hint">
          {!settled ? 'Loading…' : loaded.length > 0 ? 'Tap to explore' : 'No items available'}
        </p>
        {settled && failed > 0 && <div className="carrete-load-error" role="status">
          <p>{failed === 1 ? 'One item could not be loaded.' : `${failed} items could not be loaded.`}</p>
          <button className="minimal-basic-link carrete-text-button" onClick={() => setAttempt(value => value + 1)}>Retry</button>
          {loaded.length > 0 && <span>You can explore the {loaded.length} available items.</span>}
        </div>}
        {collection.length === 0 && <p className="carrete-empty">The camera roll is empty.</p>}
        <span className="carrete-sr-only" role="status">{settled
          ? loaded.length ? `${loaded.length} items ready. You can enter now.` : 'No items are available.'
          : 'Loading camera roll.'}</span>
      </div>
      <footer className="carrete-intro-footer">
        <span>Photography & video</span>
        <span>@txnioh · {String(collection.length).padStart(2, '0')}</span>
      </footer>
    </section>}

    {canConfigure && <EffectSettings settings={settings} setSettings={setSettings} entered={entered}
      canEnter={settled && loaded.length > 0} reducedMotion={reducedMotion}
      onIntro={showIntro} onGrid={() => setEntered(true)} onReplay={replay} />}
    <div ref={playerSlot} />
    {createPortal(<NowPlaying />, playerHost)}
    {selected !== null && <MediaViewer media={ordered} index={selected.index} quality={quality}
      initialSource={selected.source} reducedMotion={reducedMotion} onClose={close}
      onNavigate={navigate} onSource={retainSource} videoPositions={videoPositions} playerHost={playerHost} />}
  </main>;
}
