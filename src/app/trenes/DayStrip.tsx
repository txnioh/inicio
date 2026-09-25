import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { drawText, measure } from './pixelType';
import { clock, day, type Train } from './schedule';
import { pick } from './theme';

// The whole day at a glance, 3.6 or 7.2 minutes a pixel depending on room:
// a tick for every departure, taller for long-distance ones. Drag it to
// travel in time.
const H = 16;
const BASE = 8;
const heights = { HS: 4, IC: 3, RG: 2 } as const;
const INTRO_DELAY = 1100;
const INTRO_END = 1000;

type Props = { width: number; reducedMotion: boolean; now: () => number; minute: number; onSeek: (minute: number) => void; scale: number; dpr: number };

export default function DayStrip({ width: W, reducedMotion, now, minute, onSeek, scale, dpr }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const born = useRef<number | null>(null);
  const today = Math.floor(minute / 1440);
  const PER_PX = 1440 / W;

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let drawn = '';
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      // On arrival the baseline draws across, then the day's ticks grow up
      // from it left to right, and the "now" marker drops in last.
      born.current ??= reducedMotion ? -Infinity : time + INTRO_DELAY;
      const intro = time - born.current;
      const opening = intro < INTRO_END;
      const current = now();
      const x = Math.floor((current - today * 1440) / PER_PX);
      const palette = pick(
        { line: '#dcdad2', label: '#b3b2ac', past: '#e0ded7', soon: '#8e8e8a', later: '#c9c7bf', now: '#111111' },
        { line: '#363531', label: '#6f6e69', past: '#2b2a27', soon: '#a3a29d', later: '#55544f', now: '#e0e0e0' },
      );
      const key = `${x}${palette.now}`;
      if (key === drawn && !opening) return;
      drawn = key;
      const at = (from: number, span: number) => Math.max(0, Math.min(1, (intro - from) / span));
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = palette.line;
      ctx.fillRect(0, BASE, Math.round(W * (1 - (1 - at(0, 380)) ** 3)), 1);
      for (let hour = 0; hour <= 24; hour += 3) {
        const hx = Math.min(W - 1, Math.round(hour * 60 / PER_PX));
        if (at(hx / W * 380, 1) < 1) continue;
        ctx.fillStyle = palette.line;
        ctx.fillRect(hx, BASE + 1, 1, 1);
        if (hour % 6 || hour === 24) continue;
        const label = String(hour).padStart(2, '0');
        drawText(ctx, label, Math.min(W - measure(label), Math.max(0, hx - 3)), BASE, palette.label);
      }
      day(today).forEach((train: Train) => {
        const tx = Math.floor((train.departure - today * 1440) / PER_PX);
        const soon = train.departure > current && train.departure - current < 90;
        const height = Math.round(heights[train.service] * at(200 + tx / W * 520, 160));
        if (!height) return;
        ctx.fillStyle = train.departure <= current ? palette.past : soon ? palette.soon : palette.later;
        ctx.fillRect(tx, BASE - height, 1, height);
      });
      const drop = at(760, 220);
      if (!drop) return;
      const dy = Math.round(-4 * (1 - drop) ** 2);
      ctx.fillStyle = palette.now;
      ctx.fillRect(x, 1 + dy, 1, BASE);
      ctx.fillRect(x - 1, dy, 3, 1);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [now, today, W, PER_PX, reducedMotion]);

  const seek = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(.9999, (event.clientX - box.left) / box.width));
    onSeek(today * 1440 + fraction * 1440);
  };

  const onKey = (event: KeyboardEvent) => {
    const step = { ArrowRight: 5, ArrowLeft: -5, PageUp: 60, PageDown: -60 }[event.key];
    if (!step) return;
    event.preventDefault();
    onSeek(now() + step);
  };

  return (
    <canvas
      ref={canvas}
      className="trenes-strip"
      width={W}
      height={H}
      style={{ width: W * scale / dpr, height: H * scale / dpr }}
      tabIndex={0}
      role="slider"
      aria-label="Time of day"
      aria-valuemin={0}
      aria-valuemax={1439}
      aria-valuenow={Math.floor(minute - today * 1440)}
      aria-valuetext={clock(minute)}
      onKeyDown={onKey}
      onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); seek(event); }}
      onPointerMove={event => { if (dragging.current) seek(event); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    />
  );
}
