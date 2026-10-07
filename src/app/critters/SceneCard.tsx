import { useEffect, useRef } from 'react';
import { Grid } from './grid';
import { drawPixels, drawText, PIXEL_H, PIXEL_W } from './render';
import type { Scene } from './scenes/types';

export type Style = 'text' | 'pixel';

/** One scene on a canvas, animated while it is on screen. */
export default function SceneCard({ scene, style }: { scene: Scene; style: Style }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const grid = new Grid();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, visible = false, w = 0, h = 0, last = '';

    const size = () => {
      last = '';
      if (style === 'pixel') {
        el.width = PIXEL_W;
        el.height = PIXEL_H;
        return;
      }
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      grid.clear();
      scene.frame(grid, t % scene.loop);
      // Motion is in whole cells, so most frames repeat the one before.
      const key = grid.cells.map(c => (c ? c.ch + c.color + c.turn : '')).join('|') + JSON.stringify([grid.sprites, grid.snake]);
      if (key === last) return;
      last = key;
      ctx.fillStyle = scene.bg;
      if (style === 'pixel') {
        ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
        drawPixels(ctx, grid);
      } else {
        ctx.fillRect(0, 0, w, h);
        drawText(ctx, grid, w, h);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (visible) draw(now / 1000);
    };

    const resize = new ResizeObserver(() => { size(); draw(reduced ? scene.still : performance.now() / 1000); });
    resize.observe(el);
    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    seen.observe(el);
    document.fonts.ready.then(() => {
      size();
      if (reduced) draw(scene.still);
      else raf = requestAnimationFrame(loop);
    });
    return () => { cancelAnimationFrame(raf); resize.disconnect(); seen.disconnect(); };
  }, [scene, style]);

  return (
    <figure className="cr-scene">
      <canvas ref={canvas} className={style === 'pixel' ? 'cr-pixelated' : undefined} role="img" aria-label={`${scene.animal} in the ${scene.place}`} />
      <figcaption>{scene.animal} <span>· {scene.place}</span></figcaption>
    </figure>
  );
}
