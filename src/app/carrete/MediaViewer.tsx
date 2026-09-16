import { useLayoutEffect, useRef, useState } from 'react';
import type { LoadedMedia } from './media';
import { wrap } from './InfiniteGrid';

const easing = 'cubic-bezier(.22,.8,.2,1)';

function findTile(grid: HTMLElement | null, index: number, initialSource: HTMLButtonElement) {
  if (Number(initialSource.dataset.mediaIndex) === index && initialSource.isConnected) return initialSource;
  const tiles = [...(grid?.querySelectorAll<HTMLButtonElement>(`[data-media-index="${index}"]`) ?? [])];
  return tiles.reduce<HTMLButtonElement | null>((best, tile) => {
    const distance = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return Math.hypot(rect.x + rect.width / 2 - innerWidth / 2, rect.y + rect.height / 2 - innerHeight / 2);
    };
    return !best || distance(tile) < distance(best) ? tile : best;
  }, null);
}

function tilePose(tile: HTMLButtonElement, frame: HTMLElement) {
  const from = tile.getBoundingClientRect();
  const to = frame.getBoundingClientRect();
  const matrix = new DOMMatrixReadOnly(getComputedStyle(tile).transform);
  const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
  const scale = tile.offsetWidth / frame.offsetWidth;
  return {
    transform: `translate(${from.x + from.width / 2 - to.x - to.width / 2}px, ${from.y + from.height / 2 - to.y - to.height / 2}px) rotate(${angle}deg) scale(${scale})`,
    borderRadius: `${10 / scale}px`,
  };
}

function expandedVideoPose(tile: HTMLButtonElement, frame: HTMLElement) {
  const target = frame.getBoundingClientRect();
  const plane = tile.parentElement!.getBoundingClientRect();
  const scale = frame.offsetWidth / tile.offsetWidth;
  const x = target.x + target.width / 2 - plane.x - tile.offsetWidth / 2;
  const y = target.y + target.height / 2 - plane.y - tile.offsetHeight / 2;
  return { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(${scale})`, borderRadius: `${10 / scale}px` };
}

function pauseVideo(video: HTMLVideoElement | null, grid: HTMLElement | null, positions: Map<string, number>) {
  if (!video) return;
  video.pause();
  video.muted = true;
  if (video.readyState < 1 || video.seeking) return;
  const id = video.dataset.mediaId!;
  positions.set(id, video.currentTime);
  // Repeated tiles are also real paused videos. Only the selected copy plays.
  grid?.querySelectorAll<HTMLVideoElement>('video').forEach(copy => {
    if (copy !== video && copy.dataset.mediaId === id && copy.readyState >= 1
      && Math.abs(copy.currentTime - video.currentTime) > .001) {
      copy.currentTime = Math.min(video.currentTime, copy.duration);
    }
  });
}

function playVideo(video: HTMLVideoElement, tile: HTMLButtonElement) {
  video.muted = false;
  void video.play().catch(error => {
    if (error.name !== 'NotAllowedError' || !tile.hasAttribute('data-playing')) return;
    video.muted = true;
    void video.play().catch(() => { /* Device power settings may restrict playback. */ });
  });
}

export default function MediaViewer({ media, index, initialSource: openingSource, reducedMotion, onClose,
  onNavigate, onSource, videoPositions }: {
  media: LoadedMedia[];
  index: number;
  initialSource: HTMLButtonElement;
  reducedMotion: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onSource: (source: HTMLButtonElement) => void;
  videoPositions: Map<string, number>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const source = useRef<HTMLButtonElement | null>(null);
  const animated = useRef<HTMLElement | null>(null);
  const activeVideo = useRef<HTMLVideoElement | null>(null);
  const animation = useRef<Animation | null>(null);
  const closing = useRef(false);
  const [ready, setReady] = useState(reducedMotion);
  const { item, image } = media[index];
  const initialSource = useRef(openingSource).current;
  const grid = useRef(initialSource.closest<HTMLElement>('.carrete-grid')).current;

  useLayoutEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    element.showModal();
    grid?.querySelectorAll<HTMLElement>('.carrete-tile').forEach(tile => {
      const rect = tile.getBoundingClientRect();
      tile.style.setProperty('--focus-x', `${(rect.x + rect.width / 2 - innerWidth / 2) * .045}px`);
      tile.style.setProperty('--focus-y', `${(rect.y + rect.height / 2 - innerHeight / 2) * .045}px`);
    });
    grid?.classList.add('is-focused');
    return () => {
      grid?.classList.remove('is-focused');
      element.close();
      const returnFocus = previousFocus?.closest('.carrete-tile') ? grid : previousFocus;
      returnFocus?.focus({ preventScroll: true });
    };
  }, [grid]);

  useLayoutEffect(() => {
    if (closing.current) { onClose(); return; }
    const element = frame.current!;
    const viewport = stage.current!;
    const size = () => {
      const width = Math.min(viewport.clientWidth, viewport.clientHeight * item.width / item.height);
      element.style.width = `${width}px`;
      element.style.height = `${width * item.height / item.width}px`;
    };
    const tile = findTile(grid, index, initialSource);
    source.current = tile;
    if (tile) onSource(tile);
    const video = item.type === 'video' ? tile?.querySelector('video') ?? null : null;
    activeVideo.current = video;
    const surface = video && tile ? tile : element;
    animated.current = surface;
    tile?.setAttribute(video ? 'data-playing' : 'data-viewing', 'true');
    size();
    setReady(reducedMotion);
    const destination = video && tile ? expandedVideoPose(tile, element)
      : { transform: 'none', borderRadius: '10px', opacity: 1 };
    const origin = video && tile ? { transform: tile.style.transform, borderRadius: '10px' }
      : tile ? tilePose(tile, element) : { transform: 'scale(.94)', opacity: 0 };
    animation.current = surface.animate([origin, destination], {
      duration: reducedMotion ? 0 : 620, easing, fill: 'both',
    });
    animation.current.onfinish = () => setReady(true);
    if (video && tile) playVideo(video, tile);

    let width = viewport.clientWidth;
    let height = viewport.clientHeight;
    let tileWidth = tile?.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (width === viewport.clientWidth && height === viewport.clientHeight && tileWidth === tile?.offsetWidth) return;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      tileWidth = tile?.offsetWidth;
      if (closing.current) { onClose(); return; }
      animation.current?.cancel();
      size();
      if (video && tile) {
        const pose = expandedVideoPose(tile, element);
        animation.current = tile.animate([pose, pose], { duration: 0, fill: 'both' });
      }
      setReady(true);
    });
    observer.observe(viewport);
    if (video && tile) observer.observe(tile);
    return () => {
      observer.disconnect();
      pauseVideo(video, grid, videoPositions);
      animation.current?.cancel();
      tile?.removeAttribute('data-viewing');
      tile?.removeAttribute('data-playing');
      activeVideo.current = null;
    };
  }, [index, reducedMotion, item.width, item.height, item.type, grid, initialSource, onClose, onSource, videoPositions]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    pauseVideo(activeVideo.current, grid, videoPositions);
    setReady(false);
    dialog.current!.dataset.closing = 'true';
    grid?.classList.remove('is-focused');
    if (reducedMotion) { onClose(); return; }
    const surface = animated.current!;
    const current = getComputedStyle(surface);
    const from = { transform: current.transform, borderRadius: current.borderRadius, opacity: current.opacity };
    animation.current?.cancel();
    const tile = source.current;
    const destination = activeVideo.current && tile
      ? { transform: tile.style.transform, borderRadius: '10px', opacity: 1 }
      : tile ? tilePose(tile, frame.current!) : { transform: 'scale(.94)', opacity: 0 };
    animation.current = surface.animate([from, destination], { duration: 460, easing, fill: 'both' });
    animation.current.onfinish = onClose;
  };
  const move = (direction: number) => {
    if (!closing.current) onNavigate(wrap(index + direction, media.length));
  };

  return <dialog ref={dialog} className="carrete-viewer" aria-label={item.alt} data-ready={ready}
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    }}>
    <header className="carrete-header">
      <div className="carrete-heading"><span>Carrete</span><span className="carrete-count">{String(media.length).padStart(2, '0')}</span></div>
      <button className="minimal-basic-link carrete-text-button" onClick={close} autoFocus>Volver</button>
    </header>
    <div ref={stage} className="carrete-viewer-stage" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={frame} className="carrete-viewer-media">
        {item.type === 'image' && <button className="carrete-viewer-photo" aria-label="Cerrar imagen" onClick={close}>
          <img key={item.id} src={image.src} alt={item.alt} width={item.width} height={item.height} draggable={false} />
        </button>}
      </div>
    </div>
    <footer className="carrete-viewer-footer">
      <span className="carrete-viewer-caption" aria-live="polite">{item.title || item.alt}</span>
      <div>
        <span className="carrete-counter">{String(index + 1).padStart(2, '0')} <span>/ {String(media.length).padStart(2, '0')}</span></span>
        <button className="carrete-arrow" aria-label="Imagen anterior" onClick={() => move(-1)}>←</button>
        <button className="carrete-arrow" aria-label="Imagen siguiente" onClick={() => move(1)}>→</button>
      </div>
    </footer>
  </dialog>;
}
