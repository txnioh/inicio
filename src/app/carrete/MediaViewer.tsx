import { useLayoutEffect, useRef, useState } from 'react';
import type { LoadedMedia } from './media';
import { wrap } from './InfiniteGrid';

export default function MediaViewer({ media, initialIndex, onClose }: {
  media: LoadedMedia[];
  initialIndex: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const { item, image, videoUrl } = media[index];
  const move = (direction: number) => setIndex(current => wrap(current + direction, media.length));

  useLayoutEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => { element.close(); previousFocus?.focus({ preventScroll: true }); };
  }, []);

  return <dialog ref={dialog} className="carrete-viewer" aria-label={item.alt} onCancel={onClose}
    onKeyDown={event => {
      if (event.target instanceof HTMLVideoElement) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    }}>
    <header className="carrete-header">
      <span>{item.title || 'Carrete'}</span>
      <button className="minimal-basic-link carrete-text-button" onClick={onClose} autoFocus>Volver</button>
    </header>
    <div className="carrete-viewer-stage" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      {item.type === 'video'
        ? <video key={item.id} src={videoUrl} poster={image.src} controls playsInline preload="auto" aria-label={item.alt} />
        : <img key={item.id} src={image.src} alt={item.alt} width={item.width} height={item.height} draggable={false} />}
    </div>
    <footer className="carrete-viewer-footer">
      <span className="carrete-counter">{String(index + 1).padStart(2, '0')} <span>/ {String(media.length).padStart(2, '0')}</span></span>
      <div>
        <button className="carrete-arrow" aria-label="Imagen anterior" onClick={() => move(-1)}>←</button>
        <button className="carrete-arrow" aria-label="Imagen siguiente" onClick={() => move(1)}>→</button>
      </div>
    </footer>
  </dialog>;
}
