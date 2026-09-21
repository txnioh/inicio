import { useRef, useState, type PointerEvent } from 'react';
import { frameAtTime } from './loadVideoFrames';
import PlayerIcon from '../components/PlayerIcon';
import PlayerTimelineTrack from '../components/PlayerTimelineTrack';

function timestamp(time: number) {
  const seconds = Math.max(0, Math.floor(time));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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

  return <div className="carrete-frame-timeline minimal-inline-controls is-lite">
    <div className="minimal-transport">
      <button type="button" className="minimal-play-button" onClick={onToggle}
        aria-label={playing ? 'Pause video' : 'Play video'} title={playing ? 'Pause' : 'Play'}>
        <PlayerIcon name={playing ? 'pause' : 'play'} />
      </button>
    </div>
      <div className={`minimal-timeline${dragging ? ' is-seeking' : ''}`} role="slider" tabIndex={0}
        aria-label="Video progress" aria-orientation="horizontal"
        aria-valuemin={1} aria-valuemax={times.length} aria-valuenow={selected + 1}
        aria-valuetext={`${timestamp(time)} of ${timestamp(end)}, frame ${selected + 1} of ${times.length}`}
        onPointerEnter={event => { if (event.pointerType !== 'touch') setPreview(frameAtPointer(event)); }}
        onPointerLeave={() => { if (pointer.current === null) setPreview(null); }}
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary || pointer.current !== null) return;
          event.preventDefault();
          pointer.current = event.pointerId;
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
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
        <PlayerTimelineTrack progress={percent(selected)} preview={preview === null ? null : percent(preview)} seeking={dragging} />
      </div>
      <span className="minimal-inline-time" title={`${timestamp(time)} / ${timestamp(end)}`}>{timestamp(time)} / {timestamp(end)}</span>
  </div>;
}
