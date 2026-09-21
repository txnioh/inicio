import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { imageSource, type LoadedMedia } from './media';
import type { CarreteSettings } from './settings';
import type { MediaQuality } from './quality';

export const wrap = (value: number, size: number) => ((value % size) + size) % size;
export const mediaIndex = (column: number, row: number, count: number) => wrap(column + row * 4, count);

type Position = { x: number; y: number };
type View = { width: number; height: number; cell: number; column: number; row: number };

// Crossing a cell only renders the new edge; retained photographs stay untouched.
const GridTile = memo(function GridTile({ tileKey, column, row, cell, media, index, replay, videoPositions, quality }: {
  tileKey: string;
  column: number; row: number; cell: number; media: LoadedMedia; index: number; replay: number;
  videoPositions: Map<string, number>;
  quality: MediaQuality;
}) {
  const { item, image } = media;
  const ratio = item.width / item.height;
  const variation = wrap(column * 7 + row * 11, 9);
  const size = cell * [1.12, .56, .84, .68, 1.04, .61, .92, .74, 1.18][variation];
  const width = ratio >= 1 ? size : size * ratio;
  const height = width / ratio;
  const x = column * cell + (cell - width) / 2 + Math.sin(column * 13 + row * 7) * cell * .25;
  const y = row * cell + (cell - height) / 2 + Math.cos(column * 5 + row * 17) * cell * .27;
  return <button type="button" className="carrete-tile" data-media-index={index} tabIndex={-1}
    data-grid-key={tileKey} data-column={column} data-row={row}
    style={{ width, height, zIndex: variation, transform: `translate3d(${x}px, ${y}px, 0) rotate(${Math.sin(column * 3 + row * 5) * 3}deg)` }}
    aria-label={`Open: ${item.alt}`}>
    <div key={item.type === 'image' ? replay : undefined} className="carrete-tile-content">
      {item.type === 'video'
        ? <video className="carrete-video" data-media-id={item.id} src={item.src}
            width={item.width} height={item.height} muted playsInline preload={quality === 'lite' ? 'none' : 'metadata'}
            poster={quality === 'lite' ? imageSource(item, quality) : undefined}
            controls={false} disablePictureInPicture disableRemotePlayback aria-label={item.alt}
            onLoadedMetadata={event => {
              const video = event.currentTarget;
              // Decode the actual first frame on mobile, without playing or using a poster.
              video.currentTime = Math.min(videoPositions.get(item.id) ?? .001, video.duration);
            }} />
        : <img src={image.src} alt={item.alt} width={item.width} height={item.height} draggable={false} />}
      {item.type === 'video' && <span className="carrete-video-mark" aria-label="Video">film</span>}
    </div>
  </button>;
});

export default function InfiniteGrid({ media, reducedMotion, settings, replay, onOpen, selection, videoPositions, quality }: {
  media: LoadedMedia[];
  reducedMotion: boolean;
  settings: CarreteSettings;
  replay: number;
  onOpen: (index: number, source: HTMLButtonElement) => void;
  selection: { index: number; source: HTMLButtonElement } | null;
  videoPositions: Map<string, number>;
  quality: MediaQuality;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const openTile = useRef<(tile: HTMLButtonElement) => void>(() => {});
  const tappedTile = useRef<HTMLButtonElement | null>(null);
  const [view, setView] = useState<View>({ width: 0, height: 0, cell: 300, column: 0, row: 0 });

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
    let pointer: { id: number; x: number; y: number; startX: number; startY: number; time: number;
      dragging: boolean; tile: HTMLButtonElement | null } | null = null;
    const update = (now: number) => {
      frame = 0;
      const elapsed = Math.min(lastFrame ? now - lastFrame : 0, 32);
      lastFrame = now;
      if (!pointer && !reducedMotion) {
        // Velocity is px/ms. Integrating exponential decay keeps the same
        // distance and feel at 60, 90, 120 Hz, or variable refresh rates.
        const decay = Math.exp(-elapsed / 190);
        position.x += velocity.x * 190 * (1 - decay);
        position.y += velocity.y * 190 * (1 - decay);
        velocity.x *= decay;
        velocity.y *= decay;
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
      if (!pointer && Math.hypot(velocity.x, velocity.y) > .01 && !reducedMotion) frame = requestAnimationFrame(update);
      else lastFrame = 0;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const cancelDrag = () => {
      const id = pointer?.id;
      pointer = null;
      if (id !== undefined && element.hasPointerCapture(id)) element.releasePointerCapture(id);
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
      if (event.button !== 0 || !event.isPrimary || pointer) return;
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
      velocity = { x: 0, y: 0 };
      tappedTile.current = null;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY, time: event.timeStamp, dragging: false,
        tile: event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.carrete-tile') : null };
      // Capture on the stable viewport immediately, never on recycled tiles.
      element.setPointerCapture(event.pointerId);
      element.focus({ preventScroll: true });
    };
    const move = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      const elapsed = Math.max(event.timeStamp - pointer.time, 1);
      const wasDragging = pointer.dragging;
      if (!wasDragging && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) {
        pointer.dragging = true;
        element.classList.add('is-dragging');
      }
      if (pointer.dragging) {
        position.x += wasDragging ? dx : event.clientX - pointer.startX;
        position.y += wasDragging ? dy : event.clientY - pointer.startY;
        const weight = 1 - Math.exp(-elapsed / 24);
        velocity.x += (Math.max(-3, Math.min(3, dx / elapsed)) - velocity.x) * weight;
        velocity.y += (Math.max(-3, Math.min(3, dy / elapsed)) - velocity.y) * weight;
        schedule();
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.time = event.timeStamp;
    };
    const up = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const tap = event.type === 'pointerup' && !pointer.dragging ? pointer.tile : null;
      if (event.type === 'pointercancel' || event.timeStamp - pointer.time > 80 || reducedMotion) velocity = { x: 0, y: 0 };
      cancelDrag();
      // Wait for the native click before opening: opening on pointerup would
      // send the same tap's click into the new viewer and immediately close it.
      tappedTile.current = tap;
      if (!tap) { lastFrame = performance.now(); schedule(); }
    };
    const stop = () => { cancelDrag(); velocity = { x: 0, y: 0 }; };
    openTile.current = tile => {
      stop();
      cancelAnimationFrame(frame);
      frame = 0;
      onOpen(Number(tile.dataset.mediaIndex), tile);
    };
    const lostCapture = (event: PointerEvent) => {
      // A child's implicit touch capture can be transferred to the grid.
      // Its bubbling lostpointercapture must not cancel the grid's gesture.
      if (event.target === element && event.pointerId === pointer?.id) stop();
    };
    const preventNativeDrag = (event: Event) => event.preventDefault();
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      velocity = { x: 0, y: 0 };
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
      position.x -= (event.shiftKey ? event.deltaY : event.deltaX) * unit;
      position.y -= (event.shiftKey ? 0 : event.deltaY) * unit;
      schedule();
    };
    const pan = (x: number, y: number, reset = false) => {
      velocity = { x: 0, y: 0 };
      position = reset ? { x: width / 2 - cell * 1.5, y: height / 2 - cell * 1.5 }
        : { x: position.x + x * cell * .8, y: position.y + y * cell * .8 };
      schedule();
    };
    const key = (event: KeyboardEvent) => {
      const directions: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (directions[event.key]) { event.preventDefault(); pan(...directions[event.key]); }
      if (event.key === 'Home') { event.preventDefault(); pan(0, 0, true); }
      if (event.key === 'Enter') {
        event.preventDefault();
        stop();
        const tiles = [...plane.querySelectorAll<HTMLButtonElement>('.carrete-tile')];
        const nearest = tiles.reduce<HTMLButtonElement | null>((best, tile) => {
          const distance = (candidate: HTMLButtonElement) => {
            const rect = candidate.getBoundingClientRect();
            return Math.hypot(rect.x + rect.width / 2 - width / 2, rect.y + rect.height / 2 - height / 2);
          };
          return !best || distance(tile) < distance(best) ? tile : best;
        }, null);
        if (nearest) openTile.current(nearest);
      }
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('lostpointercapture', lostCapture);
    element.addEventListener('dragstart', preventNativeDrag);
    element.addEventListener('contextmenu', preventNativeDrag);
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('keydown', key);
    window.addEventListener('blur', stop);
    return () => {
      cancelAnimationFrame(frame);
      cancelDrag();
      observer.disconnect();
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('lostpointercapture', lostCapture);
      element.removeEventListener('dragstart', preventNativeDrag);
      element.removeEventListener('contextmenu', preventNativeDrag);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('keydown', key);
      window.removeEventListener('blur', stop);
    };
  }, [media.length, reducedMotion, onOpen]);

  const columns = Math.ceil(view.width / view.cell) + 5;
  const rows = Math.ceil(view.height / view.cell) + 5;
  const tiles = view.width > 0 ? Array.from({ length: columns * rows }, (_, slot) => {
    const column = view.column + slot % columns;
    const row = view.row + Math.floor(slot / columns);
    return { key: `${column}:${row}`, column, row, index: mediaIndex(column, row, media.length) };
  }) : [];
  // Keep the actual selected node alive across viewport changes. Viewer navigation
  // can also reach a piece outside the virtual ring, so give it a temporary tile.
  if (selection && view.width > 0) {
    const held = selection.source.dataset;
    if (held.gridKey && !tiles.some(tile => tile.key === held.gridKey)) {
      tiles.push({ key: held.gridKey, column: Number(held.column), row: Number(held.row), index: Number(held.mediaIndex) });
    }
    if (!tiles.some(tile => tile.index === selection.index)) {
      tiles.push({ key: `viewer:${selection.index}`, column: view.column - 1, row: view.row - 1, index: selection.index });
    }
  }
  return <div ref={viewport} className="carrete-grid" style={{ '--fade-duration': `${settings.fadeDuration}ms` } as CSSProperties}
      onClick={event => {
        const tile = event.detail === 0 && event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>('.carrete-tile') : tappedTile.current;
        tappedTile.current = null;
        if (tile?.isConnected) openTile.current(tile);
      }}
      tabIndex={0} role="region" aria-label="Camera roll. Drag or use the arrow keys to explore. Press Enter to open the center image.">
      <div ref={world} className="carrete-world">
        {tiles.map(({ key, column, row, index }) => <GridTile key={key} tileKey={key}
          column={column} row={row} cell={view.cell} media={media[index]} index={index} quality={quality}
          replay={replay} videoPositions={videoPositions} />)}
      </div>
    </div>;
}
