import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import { perform, plan, type Plan } from './paint';
import { styles, type StyleId } from './style';
import { understand, type Scene } from './understand';
import './acuarela.css';

// Paintings made from one of the Carrete photos, one per style, shown before
// any photo is chosen, so the page explains itself without downloading the
// model.
const SAMPLE = { photo: '/carrete/instagram/C-m0owIt5PF-02.webp', width: 1375, height: 1696, border: 48 };
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
type Layout = { width: number; height: number; border: number };
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
    case 'sample': return 'Painted from one of my photos. Your first photo downloads a 27 MB model, once.';
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
  const scene = useRef<Scene | null>(null);
  const painting = useRef<Plan | null>(null);
  const running = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [status, setStatus] = useState<Status>({ name: 'sample' });
  const [seed, setSeed] = useState(1);
  const [frame, setFrame] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [styleId, setStyleId] = useState(loadStyle);
  const style = styles.find(s => s.id === styleId)!.style;
  // Paintings started from async flows use the style chosen by then.
  const styleNow = useRef(style);
  styleNow.current = style;
  useInstallable();

  const busy = ['reading', 'download', 'depth'].includes(status.name);
  const painted = !!photo && (status.name === 'done' || status.name === 'saving');

  async function paint(nextSeed: number, withFrame: boolean, animate: boolean, nextStyle = styleNow.current) {
    if (!scene.current || !canvas.current) return;
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setStatus({ name: 'painting', progress: 0 });
    // Let the status show before planning, which takes a moment on a phone.
    await new Promise(requestAnimationFrame);
    if (controller.signal.aborted) return;
    painting.current = plan(scene.current, nextSeed, SIDE, nextStyle);
    const size = await perform(canvas.current, painting.current, {
      frame: withFrame, animate, signal: controller.signal,
      onProgress: progress => { if (!controller.signal.aborted) setStatus({ name: 'painting', progress }); },
    });
    if (controller.signal.aborted) return;
    setLayout(size);
    setStatus({ name: 'done' });
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
      const read = await understand(image, 768, (stage, progress) => {
        if (!controller.signal.aborted) setStatus(stage === 'download' ? { name: 'download', progress } : { name: stage });
      });
      if (controller.signal.aborted) return URL.revokeObjectURL(url);
      scene.current = read;
      setPhoto({ url, name });
      setLayout(null);
      running.current = null;
      await paint(seed, frame, true);
    } catch (error) {
      URL.revokeObjectURL(url);
      if (controller.signal.aborted) return;
      setStatus({
        name: 'error',
        message: error instanceof Error && /decode|EncodingError/i.test(`${error.name} ${error.message}`)
          ? 'That photo could not be opened. Try a JPG, PNG or WebP.'
          : 'The model could not run here. Check the connection and try again.',
      });
    }
  }

  // The style is remembered; changing it repaints the same scene with the
  // same seed, so only the style changes.
  function chooseStyle(id: StyleId) {
    if (id === styleId) return;
    setStyleId(id);
    try {
      localStorage.setItem(STYLE_KEY, id);
    } catch { /* It just won't be remembered. */ }
    if (scene.current) void paint(seed, frame, true, styles.find(s => s.id === id)!.style);
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
    void paint(next, frame, true);
  }

  function toggleFrame(value: boolean) {
    setFrame(value);
    if (painting.current) void paint(seed, value, false);
  }

  const holdKeys = (event: KeyboardEvent, down: boolean) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setComparing(down);
    }
  };
  const shown: Layout | null = photo ? layout : SAMPLE;
  // The photo covers the painting inside its frame.
  const inset = shown && {
    left: `${shown.border / shown.width * 100}%`, top: `${shown.border / shown.height * 100}%`,
    width: `${(1 - 2 * shown.border / shown.width) * 100}%`, height: `${(1 - 2 * shown.border / shown.height) * 100}%`,
  };
  const canCompare = !photo || painted;

  return (
    <main className="minimal-portfolio-page acuarela-page" tabIndex={-1}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={drop} data-dragging={dragging || undefined}>
      <div className="minimal-portfolio-shell acuarela-shell">
        <header className="acuarela-header">
          <a className="minimal-basic-link acuarela-back" href="/">Index</a>
          <h1>Acuarela</h1>
          <p>
            Paints a photo in watercolour. It looks at the photo’s own colours and at what is near and far,
            finds its shapes, and paints them stroke by stroke. It all happens on your device.
          </p>
        </header>

        <div className="acuarela-styles" role="radiogroup" aria-label="Style">
          {styles.map((option, i) => (
            <button key={option.id} type="button" role="radio" aria-checked={option.id === styleId}
              onClick={() => chooseStyle(option.id)} disabled={busy}>
              <span aria-hidden="true">{i + 1}</span> {option.name}
            </button>
          ))}
        </div>

        <figure className="acuarela-stage">
          <div className="acuarela-painting"
            style={shown ? { '--aspect': shown.width / shown.height } as CSSProperties : undefined}
            data-empty={(!!photo && !layout && status.name !== 'painting') || undefined}
            onPointerDown={event => { if (canCompare) { event.currentTarget.setPointerCapture(event.pointerId); setComparing(true); } }}
            onPointerUp={() => setComparing(false)}
            onPointerCancel={() => setComparing(false)}
            onContextMenu={event => event.preventDefault()}>
            {!photo && <img className="acuarela-sample" src={`/acuarela/sample-${styleId}.webp`} width={SAMPLE.width} height={SAMPLE.height}
              alt="Watercolour painting of a wooded park, with a pale parasol in one corner" />}
            <canvas ref={canvas} hidden={!photo} role="img"
              aria-label={photo ? `Watercolour painting of ${photo.name}` : undefined} />
            {comparing && inset && <img className="acuarela-original" src={photo?.url ?? SAMPLE.photo} alt="" style={inset} />}
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
          <button type="button" className="acuarela-button" onClick={save} disabled={!painted}>
            Save
          </button>
        </div>

        <div className="acuarela-row">
          <button type="button" className="acuarela-text-button" onClick={again} disabled={!painted}>
            Paint it again
          </button>
          <label className="acuarela-toggle">
            <input type="checkbox" checked={frame} onChange={event => toggleFrame(event.target.checked)} disabled={!painted} />
            Frame
          </label>
          <button type="button" className="acuarela-text-button"
            onPointerDown={() => setComparing(true)} onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)} onKeyDown={event => holdKeys(event, true)}
            onKeyUp={event => holdKeys(event, false)} disabled={!canCompare}>
            Hold for photo
          </button>
        </div>
      </div>
    </main>
  );
}
