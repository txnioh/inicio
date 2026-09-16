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

export default function MediaViewer({ media, initialIndex, initialSource, reducedMotion, onClose, onVideoSnapshot }: {
  media: LoadedMedia[];
  initialIndex: number;
  initialSource: HTMLButtonElement;
  reducedMotion: boolean;
  onClose: () => void;
  onVideoSnapshot: (id: string, time: number, poster: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const frozenFrame = useRef<HTMLCanvasElement>(null);
  const snapshotReady = useRef<Promise<void>>(Promise.resolve());
  const source = useRef<HTMLButtonElement | null>(null);
  const animation = useRef<Animation | null>(null);
  const closing = useRef(false);
  const [index, setIndex] = useState(initialIndex);
  const [ready, setReady] = useState(reducedMotion);
  const { item, image, videoUrl, videoTime, videoPoster } = media[index];
  const grid = useRef(initialSource.closest<HTMLElement>('.carrete-grid')).current;

  useLayoutEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    element.showModal();
    // Move the surrounding tiles outward, keeping the selected tile's place
    // underneath the viewer for the return animation.
    grid?.querySelectorAll<HTMLElement>('.carrete-tile').forEach(tile => {
      const rect = tile.getBoundingClientRect();
      tile.style.setProperty('--focus-x', `${(rect.x + rect.width / 2 - innerWidth / 2) * .045}px`);
      tile.style.setProperty('--focus-y', `${(rect.y + rect.height / 2 - innerHeight / 2) * .045}px`);
    });
    grid?.classList.add('is-focused');
    return () => {
      animation.current?.cancel();
      source.current?.removeAttribute('data-viewing');
      grid?.classList.remove('is-focused');
      element.close();
      const returnFocus = previousFocus?.closest('.carrete-tile') ? grid : previousFocus;
      returnFocus?.focus({ preventScroll: true });
    };
  }, [grid]);

  useLayoutEffect(() => {
    if (closing.current) { void snapshotReady.current.then(onClose); return; }
    frozenFrame.current!.hidden = true;
    const element = frame.current!;
    const viewport = stage.current!;
    const size = () => {
      const width = Math.min(viewport.clientWidth, viewport.clientHeight * item.width / item.height);
      element.style.width = `${width}px`;
      element.style.height = `${width * item.height / item.width}px`;
    };
    animation.current?.cancel();
    source.current?.removeAttribute('data-viewing');
    source.current = findTile(grid, index, initialSource);
    source.current?.setAttribute('data-viewing', 'true');
    size();
    setReady(reducedMotion);
    const origin = source.current ? tilePose(source.current, element) : { transform: 'scale(.94)', opacity: 0 };
    animation.current = element.animate([origin, { transform: 'none', borderRadius: '10px', opacity: 1 }], {
      duration: reducedMotion ? 0 : 620, easing, fill: 'both',
    });
    animation.current.onfinish = () => setReady(true);
    let width = viewport.clientWidth;
    let height = viewport.clientHeight;
    const observer = new ResizeObserver(() => {
      if (width === viewport.clientWidth && height === viewport.clientHeight) return;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      if (closing.current) { void snapshotReady.current.then(onClose); return; }
      animation.current?.cancel();
      size();
      setReady(true);
    });
    observer.observe(viewport);
    return () => { observer.disconnect(); animation.current?.cancel(); };
  }, [index, reducedMotion, item.width, item.height, grid, initialSource, onClose]);

  const rememberVideo = (freeze = false): Promise<void> => {
    const video = frame.current?.querySelector('video');
    if (!video) return Promise.resolve();
    video.pause();
    if (video.readyState < 2 || video.seeking) return Promise.resolve();
    // Capture once on leaving the film, never during playback or grid movement.
    const canvas = freeze ? frozenFrame.current! : document.createElement('canvas');
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return Promise.resolve();
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (freeze) canvas.hidden = false;
    const poster = canvas.toDataURL('image/webp', .84);
    onVideoSnapshot(item.id, video.currentTime, poster);
    const thumbnail = new Image();
    thumbnail.src = poster;
    return thumbnail.decode().catch(() => { /* Keep the previous rendered frame if decoding fails. */ });
  };
  const startVideo = (video: HTMLVideoElement) => {
    if (closing.current) return;
    if (videoTime && videoTime < video.duration - .05) video.currentTime = videoTime;
    void video.play().catch(() => {
      if (closing.current || !video.isConnected) return;
      // Browsers that block audible autoplay can still start inline, muted.
      video.muted = true;
      void video.play().catch(() => { /* Playback may be restricted by device power settings. */ });
    });
  };
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const element = frame.current!;
    snapshotReady.current = rememberVideo(true);
    const finish = async () => {
      await snapshotReady.current;
      await source.current?.querySelector('img')?.decode().catch(() => {});
      onClose();
    };
    setReady(false);
    dialog.current!.dataset.closing = 'true';
    grid?.classList.remove('is-focused');
    if (reducedMotion) { void finish(); return; }
    const current = getComputedStyle(element);
    const from = { transform: current.transform, borderRadius: current.borderRadius, opacity: current.opacity };
    animation.current?.cancel();
    if (!source.current?.isConnected) {
      source.current = findTile(grid, index, initialSource);
      source.current?.setAttribute('data-viewing', 'true');
    }
    const destination = source.current ? tilePose(source.current, element) : { transform: 'scale(.94)', opacity: 0 };
    animation.current = element.animate([from, destination], { duration: 460, easing, fill: 'both' });
    animation.current.onfinish = () => { void finish(); };
  };
  const move = (direction: number) => {
    if (closing.current) return;
    void rememberVideo();
    setIndex(current => wrap(current + direction, media.length));
  };

  return <dialog ref={dialog} className="carrete-viewer" aria-label={item.alt} data-ready={ready}
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => {
      if (event.target instanceof HTMLVideoElement) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    }}>
    <header className="carrete-header">
      <div className="carrete-heading"><span>Carrete</span><span className="carrete-count">{String(media.length).padStart(2, '0')}</span></div>
      <button className="minimal-basic-link carrete-text-button" onClick={close} autoFocus>Volver</button>
    </header>
    <div ref={stage} className="carrete-viewer-stage" onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={frame} className="carrete-viewer-media">
        {item.type === 'video'
          ? <video key={item.id} src={videoUrl} poster={videoPoster ?? image.src} controls={false}
              autoPlay playsInline disablePictureInPicture disableRemotePlayback preload="auto" aria-label={item.alt}
              onLoadedMetadata={event => startVideo(event.currentTarget)} />
          : <button className="carrete-viewer-photo" aria-label="Cerrar imagen" onClick={close}>
            <img key={item.id} src={image.src} alt={item.alt} width={item.width} height={item.height} draggable={false} />
          </button>}
        <canvas ref={frozenFrame} className="carrete-viewer-frozen" hidden aria-hidden="true" />
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
