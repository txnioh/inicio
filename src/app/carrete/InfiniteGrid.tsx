import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { LoadedMedia } from './media';
import GhostReveal, { ghostStyle } from './GhostReveal';
import type { CarreteSettings } from './settings';

export const wrap = (value: number, size: number) => ((value % size) + size) % size;
export const mediaIndex = (column: number, row: number, count: number) => wrap(column + row * 4, count);

type Position = { x: number; y: number };
type View = { width: number; height: number; cell: number; column: number; row: number };

export default function InfiniteGrid({ media, reducedMotion, settings, replay, onOpen }: {
  media: LoadedMedia[];
  reducedMotion: boolean;
  settings: CarreteSettings;
  replay: number;
  onOpen: (index: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const pan = useRef<(x: number, y: number, reset?: boolean) => void>(() => {});
  const suppressClick = useRef(false);
  const [view, setView] = useState<View>({ width: 0, height: 0, cell: 300, column: 0, row: 0 });
  const revealStyle = useMemo(() => ghostStyle(settings), [settings]);

  useLayoutEffect(() => { viewport.current?.classList.remove('is-exploring'); }, [replay]);

  useEffect(() => {
    const element = viewport.current!;
    const plane = world.current!;
    let frame = 0;
    let lastFrame = 0;
    let width = 0;
    let height = 0;
    let cell = 300;
    let origin = '';
    let position: Position = { x: 0, y: 0 };
    let velocity: Position = { x: 0, y: 0 };
    let pointer: { id: number; x: number; y: number; startX: number; startY: number; time: number } | null = null;
    const update = (now: number) => {
      frame = 0;
      const delta = Math.min(lastFrame ? (now - lastFrame) / 16.667 : 1, 2);
      lastFrame = now;
      if (!pointer && !reducedMotion) {
        position.x += velocity.x * delta;
        position.y += velocity.y * delta;
        velocity.x *= Math.pow(.92, delta);
        velocity.y *= Math.pow(.92, delta);
      }
      const column = Math.floor(-position.x / cell) - 2;
      const row = Math.floor(-position.y / cell) - 2;
      const nextOrigin = `${column},${row},${width},${height}`;
      if (origin !== nextOrigin) {
        origin = nextOrigin;
        // Commit the next ring of predecoded tiles before moving the plane.
        // A large wheel/drag jump must never paint ahead of the virtual grid.
        flushSync(() => setView({ width, height, cell, column, row }));
      }
      plane.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
      if (!pointer && Math.hypot(velocity.x, velocity.y) > .1 && !reducedMotion) frame = requestAnimationFrame(update);
      else lastFrame = 0;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const cancelDrag = () => {
      if (pointer && element.hasPointerCapture(pointer.id)) element.releasePointerCapture(pointer.id);
      pointer = null;
      element.classList.remove('is-dragging');
    };
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      const nextHeight = entry.contentRect.height;
      const nextCell = nextWidth < 600 ? 220 : 320;
      position = width === 0 ? { x: nextWidth / 2 - nextCell * 1.5, y: nextHeight / 2 - nextCell * 1.5 }
        : { x: (position.x - width / 2) * nextCell / cell + nextWidth / 2,
          y: (position.y - height / 2) * nextCell / cell + nextHeight / 2 };
      width = nextWidth;
      height = nextHeight;
      cell = nextCell;
      schedule();
    });
    observer.observe(element);

    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      velocity = { x: 0, y: 0 };
      suppressClick.current = false;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY, time: event.timeStamp };
      element.focus({ preventScroll: true });
    };
    const move = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      const delta = Math.max(event.timeStamp - pointer.time, 8);
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) {
        suppressClick.current = true;
        element.setPointerCapture(event.pointerId);
        element.classList.add('is-dragging');
        element.classList.add('is-exploring');
      }
      position.x += dx;
      position.y += dy;
      velocity = { x: Math.max(-50, Math.min(50, dx / delta * 16.667)), y: Math.max(-50, Math.min(50, dy / delta * 16.667)) };
      pointer = { ...pointer, x: event.clientX, y: event.clientY, time: event.timeStamp };
      schedule();
    };
    const up = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (event.type === 'pointercancel' || event.timeStamp - pointer.time > 80 || reducedMotion) velocity = { x: 0, y: 0 };
      cancelDrag();
      schedule();
    };
    const stop = () => { cancelDrag(); velocity = { x: 0, y: 0 }; };
    const lostCapture = () => { if (pointer) stop(); };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      element.classList.add('is-exploring');
      velocity = { x: 0, y: 0 };
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
      position.x -= (event.shiftKey ? event.deltaY : event.deltaX) * unit;
      position.y -= (event.shiftKey ? 0 : event.deltaY) * unit;
      schedule();
    };
    pan.current = (x, y, reset) => {
      element.classList.add('is-exploring');
      velocity = { x: 0, y: 0 };
      position = reset ? { x: width / 2 - cell * 1.5, y: height / 2 - cell * 1.5 }
        : { x: position.x + x * cell * .8, y: position.y + y * cell * .8 };
      schedule();
    };
    const key = (event: KeyboardEvent) => {
      const directions: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (directions[event.key]) { event.preventDefault(); pan.current(...directions[event.key]); }
      if (event.key === 'Home') { event.preventDefault(); pan.current(0, 0, true); }
      if (event.key === 'Enter') {
        event.preventDefault();
        stop();
        onOpen(mediaIndex(Math.floor((width / 2 - position.x) / cell), Math.floor((height / 2 - position.y) / cell), media.length));
      }
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('lostpointercapture', lostCapture);
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('keydown', key);
    window.addEventListener('blur', stop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('lostpointercapture', lostCapture);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('keydown', key);
      window.removeEventListener('blur', stop);
    };
  }, [media.length, reducedMotion, onOpen]);

  const columns = Math.ceil(view.width / view.cell) + 5;
  const rows = Math.ceil(view.height / view.cell) + 5;
  return <>
    <div ref={viewport} className="carrete-grid" style={revealStyle} tabIndex={0} role="region" aria-label="Carrete. Arrastra o usa las flechas para explorar. Pulsa Intro para ampliar la imagen central.">
      <div ref={world} className="carrete-world">
        {view.width > 0 && Array.from({ length: columns * rows }, (_, slot) => {
          const column = view.column + slot % columns;
          const row = view.row + Math.floor(slot / columns);
          const index = mediaIndex(column, row, media.length);
          const { item, image } = media[index];
          const ratio = item.width / item.height;
          const size = view.cell * [0.7, 0.79, 0.67, 0.74][wrap(index, 4)];
          const width = ratio >= 1 ? size : size * ratio;
          const height = width / ratio;
          const x = column * view.cell + (view.cell - width) / 2;
          const y = row * view.cell + (view.cell - height) / 2 + (wrap(column, 2) ? 24 : -24);
          return <button type="button" key={`${column}:${row}`} className="carrete-tile" tabIndex={-1}
            style={{ width, height, transform: `translate3d(${x}px, ${y}px, 0)` } as CSSProperties}
            aria-label={`Ampliar: ${item.alt}`} onClick={() => { if (!suppressClick.current) onOpen(index); }}>
            <GhostReveal key={replay}>
              <img src={image.src} alt={item.alt} width={item.width} height={item.height} draggable={false} />
              {item.type === 'video' && <span className="carrete-video-mark" aria-label="Vídeo">↗ film</span>}
            </GhostReveal>
          </button>;
        })}
      </div>
    </div>
    <footer className="carrete-grid-footer">
      <span className="carrete-drag-hint">Arrastra para explorar</span>
      <div className="carrete-pan-controls" aria-label="Mover el carrete">
        <button className="minimal-basic-link carrete-text-button" onClick={() => pan.current(0, 0, true)}>Centrar</button>
        <button className="carrete-arrow" aria-label="Explorar a la izquierda" onClick={() => pan.current(1, 0)}>←</button>
        <button className="carrete-arrow" aria-label="Explorar hacia arriba" onClick={() => pan.current(0, 1)}>↑</button>
        <button className="carrete-arrow" aria-label="Explorar hacia abajo" onClick={() => pan.current(0, -1)}>↓</button>
        <button className="carrete-arrow" aria-label="Explorar a la derecha" onClick={() => pan.current(-1, 0)}>→</button>
      </div>
    </footer>
  </>;
}
