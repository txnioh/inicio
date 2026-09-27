import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import { createLoader, type Loader } from './loading';
import { layoutFor, perform, plan, type Layout } from './paint';
import { lookFor, styles, type StyleId } from './style';
import { understand, type Scene } from './understand';
import './acuarela.css';

// Paintings made from one of the Carrete photos, one per style, shown before
// any photo is chosen, so the page explains itself without downloading the
// model.
const SAMPLE = { photo: '/carrete/instagram/C-m0owIt5PF-02.webp', width: 1279, height: 1600 };
const SIDE = 1600;
const STYLE_KEY = 'acuarela:style';

function loadStyle(): StyleId {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    const known = styles.find(s => s.id === saved);
    if (known) return known.id;
  } catch { /* Private mode: start with the first style. */ }
  return styles[0].id;
}

type Photo = { url: string; name: string };
type Status =
  | { name: 'sample' | 'reading' | 'depth' | 'done' | 'saving' }
  | { name: 'download' | 'painting'; progress: number }
  | { name: 'error'; message: string };

function decode(url: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  return image.decode().then(() => image);
}

// While on this page, the home screen gets Acuarela's name and icon, and
// opens straight into it.
function useInstallable() {
  useEffect(() => {
    const title = document.title;
    document.title = 'Acuarela';
    const touchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const touchHref = touchIcon?.getAttribute('href');
    touchIcon?.setAttribute('href', '/acuarela/icon-180.png');
    const added = [
      ['link', { rel: 'manifest', href: '/acuarela/manifest.webmanifest' }],
      ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
      ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
      ['meta', { name: 'apple-mobile-web-app-title', content: 'Acuarela' }],
    ].map(([tag, attributes]) => {
      const element = document.createElement(tag as string);
      Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
      return document.head.appendChild(element);
    });
    return () => {
      document.title = title;
      if (touchIcon && touchHref) touchIcon.setAttribute('href', touchHref);
      added.forEach(element => element.remove());
    };
  }, []);
}

function describe(status: Status) {
  switch (status.name) {
    case 'sample': return 'The first photo downloads a 27 MB model, once.';
    case 'reading': return 'Opening the photo…';
    case 'download': return `Downloading the model, only this once · ${Math.round(status.progress * 100)}%`;
    case 'depth': return 'Measuring what is near and what is far…';
    case 'painting': return `Painting · ${Math.round(status.progress * 100)}%`;
    case 'saving': return 'Saving…';
    case 'error': return status.message;
    case 'done': return 'Press and hold the painting to see the photo.';
  }
}

export default function Acuarela() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cover = useRef<HTMLCanvasElement>(null);
  const loader = useRef<Loader | null>(null);
  const scene = useRef<Scene | null>(null);
  // The photo being painted, as decoded.
  const picture = useRef<HTMLImageElement | null>(null);
  const running = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [status, setStatus] = useState<Status>({ name: 'sample' });
  const [seed, setSeed] = useState(1);
  const [comparing, setComparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [styleId, setStyleId] = useState(loadStyle);
  // Paintings started from async flows use the style chosen by then.
  const lookNow = useRef(lookFor(styleId));
  lookNow.current = lookFor(styleId);
  useInstallable();

  const busy = ['reading', 'download', 'depth'].includes(status.name);
  const painted = !!photo && (status.name === 'done' || status.name === 'saving');

  useEffect(() => {
    const created = createLoader(cover.current!);
    loader.current = created;
    return () => created?.dispose();
  }, []);

  // The photo shows, going wet, over the painting's place while it is
  // painted; then the new painting blooms in.
  async function paint(nextSeed: number, look = lookNow.current) {
    const read = scene.current, image = picture.current, target = canvas.current;
    if (!read || !image || !target) return;
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const { signal } = controller;
    setLayout(layoutFor(image.naturalWidth, image.naturalHeight, SIDE));
    loader.current?.start(image);
    setStatus({ name: 'painting', progress: 0 });
    try {
      const strokes = await plan(read, nextSeed, SIDE, look);
      if (signal.aborted) return;
      const shown = await perform(target, strokes, {
        signal,
        onProgress: progress => { if (!signal.aborted) setStatus({ name: 'painting', progress }); },
      });
      if (!shown || signal.aborted) return;
      await loader.current?.reveal(target);
      if (!signal.aborted) setStatus({ name: 'done' });
    } catch {
      if (signal.aborted) return;
      loader.current?.stop();
      setStatus({ name: 'error', message: 'The painting could not be made. Try again.' });
    }
  }

  async function open(url: string, name: string) {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setStatus({ name: 'reading' });
    setComparing(false);
    try {
      const image = await decode(url);
      if (controller.signal.aborted) return URL.revokeObjectURL(url);
      // The painting's place takes the photo's shape at once, and never changes it.
      setLayout(layoutFor(image.naturalWidth, image.naturalHeight, SIDE));
      loader.current?.start(image);
      const read = await understand(image, 768, (stage, progress) => {
        if (!controller.signal.aborted) setStatus(stage === 'download' ? { name: 'download', progress } : { name: stage });
      });
      if (controller.signal.aborted) return URL.revokeObjectURL(url);
      scene.current = read;
      picture.current = image;
      setPhoto({ url, name });
      running.current = null;
    } catch (error) {
      URL.revokeObjectURL(url);
      if (controller.signal.aborted) return;
      // Back to what was showing before.
      loader.current?.stop();
      const before = picture.current;
      setLayout(before && layoutFor(before.naturalWidth, before.naturalHeight, SIDE));
      return setStatus({
        name: 'error',
        message: error instanceof Error && /decode|EncodingError/i.test(`${error.name} ${error.message}`)
          ? 'That photo could not be opened. Try a JPG, PNG or WebP.'
          : 'The model could not run here. Check the connection and try again.',
      });
    }
    await paint(seed);
  }

  // The style is remembered; changing it repaints the same scene with the
  // same seed, so only the style changes.
  function chooseStyle(id: StyleId) {
    if (id === styleId) return;
    setStyleId(id);
    try {
      localStorage.setItem(STYLE_KEY, id);
    } catch { /* It just won't be remembered. */ }
    if (scene.current) void paint(seed, lookFor(id));
  }

  // Release a chosen photo once another replaces it, or on leaving.
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => () => running.current?.abort(), []);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void open(URL.createObjectURL(file), file.name);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = [...event.dataTransfer.files].find(f => f.type.startsWith('image/'));
    if (file && !busy) void open(URL.createObjectURL(file), file.name);
  }

  async function save() {
    const element = canvas.current;
    if (!element || !photo) return;
    setStatus({ name: 'saving' });
    try {
      const blob = await new Promise<Blob>((resolve, reject) => element.toBlob(
        result => result ? resolve(result) : reject(new Error('Could not export')), 'image/jpeg', .92));
      const base = photo.name.replace(/\.[^.]+$/, '') || 'photo';
      const file = new File([blob], `${base}-acuarela.jpg`, { type: 'image/jpeg' });
      // Phones get the share sheet, which can save to Photos; computers a download.
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          setStatus({ name: 'done' });
          return;
        } catch (error) {
          if ((error as Error).name === 'AbortError') return setStatus({ name: 'done' });
        }
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      setStatus({ name: 'done' });
    } catch {
      setStatus({ name: 'error', message: 'The painting could not be saved.' });
    }
  }

  function again() {
    const next = seed + 1;
    setSeed(next);
    void paint(next);
  }

  const holdKeys = (event: KeyboardEvent, down: boolean) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setComparing(down);
    }
  };
  const shown: Layout = layout ?? SAMPLE;
  const canCompare = painted || !layout;

  return (
    <main className="minimal-portfolio-page acuarela-page" tabIndex={-1}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={drop} data-dragging={dragging || undefined}>
      <div className="minimal-portfolio-shell acuarela-shell">
        <header className="acuarela-header">
          <a className="minimal-basic-link acuarela-back" href="/">Index</a>
          <h1>Acuarela</h1>
        </header>

        <div className="acuarela-styles" role="radiogroup" aria-label="Style">
          {styles.map(option => (
            <button key={option.id} type="button" role="radio" aria-checked={option.id === styleId}
              onClick={() => chooseStyle(option.id)} disabled={busy}>
              {option.name}
            </button>
          ))}
        </div>

        <figure className="acuarela-stage">
          <div className="acuarela-painting"
            style={{ '--aspect': shown.width / shown.height } as CSSProperties}
            tabIndex={canCompare ? 0 : -1} aria-label="Press and hold to see the photo"
            onKeyDown={event => holdKeys(event, true)} onKeyUp={event => holdKeys(event, false)}
            onBlur={() => setComparing(false)}
            onPointerDown={event => { if (canCompare) { event.currentTarget.setPointerCapture(event.pointerId); setComparing(true); } }}
            onPointerUp={() => setComparing(false)}
            onPointerCancel={() => setComparing(false)}
            onContextMenu={event => event.preventDefault()}>
            {!photo && <img className="acuarela-sample" src={`/acuarela/sample-${styleId}.webp`} width={SAMPLE.width} height={SAMPLE.height}
              alt={`${styleId === 'oil' ? 'Oil sketch' : 'Watercolour painting'} of a wooded park, with a pale parasol in one corner`} />}
            <canvas ref={canvas} className="acuarela-canvas" hidden={!photo} role="img"
              aria-label={photo ? `Painting of ${photo.name}` : undefined} />
            <canvas ref={cover} className="acuarela-loader" aria-hidden="true" />
            {comparing && <img className="acuarela-original" src={photo?.url ?? SAMPLE.photo} alt="" />}
          </div>
          <figcaption aria-live="polite">{describe(status)}</figcaption>
        </figure>

        <div className="acuarela-actions">
          <label className="acuarela-button acuarela-primary">
            <input type="file" accept="image/*" onChange={choose} disabled={busy} />
            Choose photo
          </label>
          <label className="acuarela-button acuarela-camera">
            <input type="file" accept="image/*" capture="environment" onChange={choose} disabled={busy} />
            Camera
          </label>
          <button type="button" className="acuarela-button" onClick={again} disabled={!painted}>
            Again
          </button>
          <button type="button" className="acuarela-button" onClick={save} disabled={!painted}>
            Save
          </button>
        </div>
      </div>
    </main>
  );
}
