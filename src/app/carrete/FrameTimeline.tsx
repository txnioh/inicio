import { useEffect, useMemo, useRef } from 'react';
import { frameAtTime } from './loadVideoFrames';

function timestamp(time: number) {
  const hundredths = Math.round(time * 100);
  return `${String(Math.floor(hundredths / 6000)).padStart(2, '0')}:${String(Math.floor(hundredths / 100) % 60).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`;
}

export default function FrameTimeline({ times, selected, zoom, playing, onSelect, onToggle }: {
  times: number[];
  selected: number;
  zoom: number;
  playing: boolean;
  onSelect: (frame: number) => void;
  onToggle: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const syncedScroll = useRef(0);
  const select = useRef(onSelect);
  select.current = onSelect;
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const end = times[times.length - 1];
  const time = times[selected];
  const ticks = useMemo(() => {
    const interval = zoom < 50 ? 2 : zoom > 160 ? .5 : 1;
    return Array.from({ length: Math.floor(end / interval) + 1 }, (_, index) => index * interval);
  }, [end, zoom]);

  const scrub = (left: number) => {
    const element = scroller.current!;
    element.scrollLeft = left;
    syncedScroll.current = element.scrollLeft;
    select.current(frameAtTime(times, element.scrollLeft / zoom));
  };

  useEffect(() => {
    const element = scroller.current!;
    element.scrollLeft = time * zoom;
    syncedScroll.current = element.scrollLeft;
  }, [time, zoom]);

  useEffect(() => {
    const element = scroller.current!;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      scrub(element.scrollLeft + delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [times, zoom]);

  return <div className="carrete-frame-timeline">
    <div className="carrete-frame-timeline-meta">
      <button type="button" className="carrete-timeline-play" onClick={onToggle}
        aria-label={playing ? 'Pausar vídeo' : 'Reproducir vídeo'}>
        <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
      </button>
      <span className="carrete-timeline-time">{timestamp(time)} <span>/ {timestamp(end)}</span></span>
      <span className="carrete-timeline-hint">Desliza para recorrer</span>
    </div>
    <div className="carrete-timeline-track">
      <div ref={scroller} className="carrete-timeline-scroll" role="slider" tabIndex={0}
        aria-label="Timeline del vídeo" aria-orientation="horizontal"
        aria-valuemin={1} aria-valuemax={times.length} aria-valuenow={selected + 1}
        aria-valuetext={`${timestamp(time)}, fotograma ${selected + 1} de ${times.length}`}
        onScroll={event => {
          const left = event.currentTarget.scrollLeft;
          if (Math.abs(left - syncedScroll.current) < .5) return;
          syncedScroll.current = left;
          select.current(frameAtTime(times, left / zoom));
        }}
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          start.moved ||= Math.abs(event.clientX - start.x) > 3;
          if (start.moved) scrub(start.left + start.x - event.clientX);
        }}
        onPointerUp={event => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          if (!start.moved) {
            const rect = event.currentTarget.getBoundingClientRect();
            scrub(event.currentTarget.scrollLeft + event.clientX - rect.left - rect.width / 2);
          }
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
          let frame = selected;
          if (event.key === 'ArrowLeft') frame--;
          else if (event.key === 'ArrowRight') frame++;
          else if (event.key === 'Home') frame = 0;
          else if (event.key === 'End') frame = times.length - 1;
          else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onToggle(); return; }
          else return;
          event.preventDefault();
          select.current(Math.max(0, Math.min(times.length - 1, frame)));
        }}>
        <div className="carrete-timeline-spacer" />
        <div className="carrete-timeline-ruler" style={{ width: end * zoom, backgroundSize: `${zoom / 4}px 7px` }}>
          <div className="carrete-timeline-elapsed" style={{ width: time * zoom }} />
          {ticks.map(tick => <span className="carrete-timeline-tick" key={tick} style={{ left: tick * zoom }}>
            {timestamp(tick).slice(0, -3)}{tick % 1 ? '.5' : ''}
          </span>)}
        </div>
        <div className="carrete-timeline-spacer" />
      </div>
      <span className="carrete-timeline-playhead" aria-hidden="true" />
    </div>
  </div>;
}
