import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { frameAtTime } from './loadVideoFrames';

function timestamp(time: number) {
  const hundredths = Math.round(time * 100);
  return `${String(Math.floor(hundredths / 6000)).padStart(2, '0')}:${String(Math.floor(hundredths / 100) % 60).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`;
}

export default function FrameTimeline({ times, selected, playing, onSelect, onToggle }: {
  times: number[];
  selected: number;
  playing: boolean;
  onSelect: (frame: number) => void;
  onToggle: () => void;
}) {
  const pointer = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const start = times[0];
  const end = times[times.length - 1];
  const duration = end - start;
  const time = times[selected];
  const percent = (frame: number) => duration > 0 ? (times[frame] - start) / duration * 100 : 0;
  const frameAtPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    return frameAtTime(times, start + progress * duration);
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    if (event.type === 'pointerup') onSelect(frameAtPointer(event));
    pointer.current = null;
    setDragging(false);
    const rect = event.currentTarget.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (event.type !== 'pointerup' || event.pointerType === 'touch' || !inside) setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div className="carrete-frame-timeline">
    <button type="button" className="carrete-timeline-play" onClick={onToggle}
      aria-label={playing ? 'Pausar vídeo' : 'Reproducir vídeo'}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
        {playing ? <path d="M5 4h3v12H5zm7 0h3v12h-3z" /> : <path d="M6 3.8a.8.8 0 0 1 1.2-.7l9 6.2a.8.8 0 0 1 0 1.4l-9 6.2a.8.8 0 0 1-1.2-.7z" />}
      </svg>
    </button>
    <div className="carrete-timeline-body">
      <div className="carrete-timeline-slider" role="slider" tabIndex={0}
        data-dragging={dragging || undefined} data-hovered={preview !== null || undefined} data-keyboard={keyboardFocus || undefined}
        style={{ '--timeline-progress': `${percent(selected)}%`, '--timeline-preview': `${percent(preview ?? selected)}%` } as CSSProperties}
        aria-label="Timeline completo del vídeo" aria-orientation="horizontal"
        aria-valuemin={1} aria-valuemax={times.length} aria-valuenow={selected + 1}
        aria-valuetext={`${timestamp(time)}, fotograma ${selected + 1} de ${times.length}`}
        onFocus={() => setKeyboardFocus(pointer.current === null)}
        onBlur={() => setKeyboardFocus(false)}
        onPointerEnter={event => { if (event.pointerType !== 'touch') setPreview(frameAtPointer(event)); }}
        onPointerLeave={() => { if (pointer.current === null) setPreview(null); }}
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary || pointer.current !== null) return;
          event.preventDefault();
          pointer.current = event.pointerId;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          setKeyboardFocus(false);
          setDragging(true);
          const frame = frameAtPointer(event);
          setPreview(frame);
          onSelect(frame);
        }}
        onPointerMove={event => {
          if (pointer.current !== null && pointer.current !== event.pointerId) return;
          const frame = frameAtPointer(event);
          if (event.pointerType !== 'touch' || pointer.current !== null) setPreview(frame);
          if (pointer.current === event.pointerId) onSelect(frame);
        }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onKeyDown={event => {
          setKeyboardFocus(true);
          let frame = selected;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') frame--;
          else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') frame++;
          else if (event.key === 'Home') frame = 0;
          else if (event.key === 'End') frame = times.length - 1;
          else if (event.key === 'PageUp') frame = frameAtTime(times, Math.min(end, time + duration / 10));
          else if (event.key === 'PageDown') frame = frameAtTime(times, Math.max(start, time - duration / 10));
          else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onToggle(); return; }
          else return;
          event.preventDefault();
          setPreview(null);
          onSelect(Math.max(0, Math.min(times.length - 1, frame)));
        }}>
        <div className="carrete-timeline-rail" aria-hidden="true">
          <div className="carrete-timeline-fill" />
          <span className="carrete-timeline-thumb" />
        </div>
        <span className="carrete-timeline-preview" aria-hidden="true">{timestamp(times[preview ?? selected])}</span>
      </div>
      <div className="carrete-timeline-times" aria-hidden="true">
        <span>{timestamp(time)}</span><span>{timestamp(end)}</span>
      </div>
    </div>
  </div>;
}
