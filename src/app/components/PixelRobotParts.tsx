// Pixel-art versions of the footer robot's face, effects and speech bubble.
// Loaded only when the visitor picks the pixel skin.
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { drawFace, drawPortal, FPS, G, H, PORTAL_FRAMES, W } from '../robot/sprites';
import { PIXEL_PORTAL_MS, type PixelPortal } from './robotAnimation';
import { drawBubbleBox, layoutBubble } from '../robot/pixelFont';

// Effects and text share the robot's 1.5px art pixel.
const TEXT_PIXEL = 1.5;

export function PixelRobotFace({ expression, portal, portalKey, onActivityEnd, look }: {
  expression: string; portal: PixelPortal | null; portalKey: number | null; onActivityEnd?: () => void;
  look?: RefObject<[number, number]>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const mood = useRef(expression);
  const clock = useRef(0);
  const ended = useRef<string | null>(null);
  const onEnd = useRef(onActivityEnd);
  mood.current = expression;
  onEnd.current = onActivityEnd;

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const done = drawFace(ctx, mood.current, clock.current, look?.current ?? undefined);
    if (done && ended.current !== mood.current) {
      ended.current = mood.current;
      onEnd.current?.();
    }
  }, [look]);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    let raf = 0;

    if (portal) {
      // Leaving holds its last frame (robot gone) until the robot arrives.
      const start = performance.now();
      const step = (now: number) => {
        const frame = Math.min(PORTAL_FRAMES - 1, Math.floor((now - start) / (PIXEL_PORTAL_MS / PORTAL_FRAMES)));
        drawPortal(ctx, portal, frame);
        if (frame < PORTAL_FRAMES - 1) raf = requestAnimationFrame(step);
      };
      step(start);
      return () => cancelAnimationFrame(raf);
    }

    draw(ctx);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / FPS) return;
      last = now;
      clock.current++;
      draw(ctx);
    };
    // Only animate while the robot is on screen.
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf);
      if (entry.isIntersecting) raf = requestAnimationFrame(tick);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [portal, portalKey, draw]);

  // Every new mood or activity starts from its first frame.
  useEffect(() => {
    clock.current = 0;
    ended.current = null;
    const ctx = canvas.current?.getContext('2d');
    if (ctx && !portal) draw(ctx);
  }, [expression, portal, draw]);

  return (
    <span className="minimal-robot-pixel">
      <canvas ref={canvas} width={W} height={H} aria-hidden="true" />
      <span className="minimal-robot-pixel-body" data-robot-face="" />
    </span>
  );
}

function PixelGlyph({ rows, color }: { rows: readonly string[]; color: string }) {
  const width = Math.max(...rows.map(row => row.length));
  return (
    <svg width={width * TEXT_PIXEL} height={rows.length * TEXT_PIXEL} viewBox={`0 0 ${width} ${rows.length}`} shapeRendering="crispEdges" fill={color}>
      {rows.flatMap((row, y) => [...row].map((pixel, x) => pixel === '#' && <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />))}
    </svg>
  );
}

export function PixelEffects({ mode }: { mode: string }) {
  if (mode === 'sleeping') return <span className="minimal-robot-effects robot-sleep" aria-hidden="true">
    {[0, 1, 2].map(index => <span key={index}><PixelGlyph rows={G.z} color="#8e8e91" /></span>)}
  </span>;
  if (mode === 'music') return <span className="minimal-robot-effects robot-music" aria-hidden="true">
    {[G.note, G.note, G.sparkle, G.note].map((rows, index) => <span key={index}><PixelGlyph rows={rows} color="#918bd6" /></span>)}
  </span>;
  if (mode === 'carried') return <span className="minimal-robot-effects robot-sweat" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map(index => <PixelGlyph key={index} rows={G.drop} color="#91b4cc" />)}
  </span>;
  return null;
}

export function PixelSpeech({ text }: { text: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Same width limit as the classic bubble (176px).
  const layout = useMemo(() => layoutBubble(text, Math.floor(176 / TEXT_PIXEL)), [text]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const total = text.length;
    const draw = (count: number) => {
      ctx.clearRect(0, 0, layout.w, layout.h);
      drawBubbleBox(ctx, layout, 0, 0, count);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(total);
      return;
    }
    // Type letters in at the classic bubble's 24ms per letter.
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const count = Math.floor((now - start) / 24) + 1;
      draw(count);
      if (count < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, layout]);

  return <canvas ref={canvas} width={layout.w} height={layout.h} style={{ width: layout.w * TEXT_PIXEL, height: layout.h * TEXT_PIXEL }} />;
}
