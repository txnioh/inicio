import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { ANOMALY_INFO, primaryAnomaly, type Twin } from '../model/analyze.ts';
import { euros } from '../model/economics.ts';
import type { Anomaly, Task } from '../model/types.ts';
import { describeValue, STATUS, THEME, type Theme } from '../colors.ts';
import { openTree, select, useStore } from '../store.ts';

type Props = {
  twin: Twin;
  theme: Theme;
  colours: { index: Uint8Array; palette: string[] };
  anomalies: (Anomaly[] | null)[];
  status: Uint8Array;
  lossKg: Float64Array;
  selectMode: boolean;
};

type Camera = { x: number; y: number; scale: number };
type Gesture =
  | { kind: 'pan'; startX: number; startY: number; moved: boolean; shift: boolean }
  | { kind: 'rect'; startX: number; startY: number; x: number; y: number; additive: boolean }
  | { kind: 'pinch'; distance: number };

const MIN_SCALE = 0.15;
const MAX_SCALE = 40;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function FarmMap({ twin, theme, colours, anomalies, status, lossKg, selectMode }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const size = useRef({ width: 0, height: 0 });
  const fitted = useRef(false);
  const frame = useRef(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);

  const campaign = useStore(s => s.campaign);
  const layer = useStore(s => s.layer);
  const tree = useStore(s => s.tree);
  const selection = useStore(s => s.selection);
  const focus = useStore(s => s.focus);
  const assumptions = useStore(s => s.assumptions);
  const activeTask = useStore(s => s.tasks.find(t => t.id === s.activeTask) ?? null);

  const latest = useRef({ colours, campaign, tree, selection, activeTask, hover, theme });
  latest.current = { colours, campaign, tree, selection, activeTask, hover, theme };

  const toScreen = (x: number, y: number) => {
    const c = camera.current, s = size.current;
    return [(x - c.x) * c.scale + s.width / 2, s.height / 2 - (y - c.y) * c.scale] as const;
  };
  const toWorld = (sx: number, sy: number) => {
    const c = camera.current, s = size.current;
    return [(sx - s.width / 2) / c.scale + c.x, (s.height / 2 - sy) / c.scale + c.y] as const;
  };

  const draw = useCallback(() => {
    frame.current = 0;
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const { colours, campaign, tree, selection, activeTask, hover, theme } = latest.current;
    const { width, height } = size.current;
    const dpr = el.width / Math.max(1, width);
    const palette = THEME[theme];
    const { scale } = camera.current;
    const { farm } = twin;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, width, height);

    for (const plot of farm.plots) {
      ctx.beginPath();
      plot.polygon.forEach((v, k) => {
        const [sx, sy] = toScreen(v.x, v.y);
        if (k) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle = palette.plot;
      ctx.fill();
      ctx.strokeStyle = palette.plotLine;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const [x0, y1] = toWorld(-10, -10);
    const [x1, y0] = toWorld(width + 10, height + 10);
    const paths = colours.palette.map(() => new Path2D());
    const shine = new Path2D();
    twin.grid.rect(x0, y0, x1, y1, i => {
      const t = farm.trees[i];
      const [sx, sy] = toScreen(t.x, t.y);
      const r = (t.snapshots[campaign].canopyDiameter / 2) * scale;
      const path = paths[colours.index[i]];
      if (r < 1.4) {
        // Squares are cheaper than arcs when a crown is barely a pixel; never fuller than the crown.
        const half = Math.max(0.5, Math.min(1.1, r * 0.8));
        path.rect(sx - half, sy - half, half * 2, half * 2);
      } else {
        path.moveTo(sx + r, sy);
        path.arc(sx, sy, r, 0, Math.PI * 2);
        if (r > 5) {
          shine.moveTo(sx - r * 0.25 + r * 0.42, sy - r * 0.3);
          shine.arc(sx - r * 0.25, sy - r * 0.3, r * 0.42, 0, Math.PI * 2);
        }
      }
    });
    paths.forEach((path, k) => {
      ctx.fillStyle = colours.palette[k];
      ctx.fill(path);
    });
    ctx.fillStyle = palette.highlight;
    ctx.fill(shine);

    const ring = (i: number, extra: number, colour: string, width: number) => {
      const t = farm.trees[i];
      const [sx, sy] = toScreen(t.x, t.y);
      const r = Math.max(2.5, (t.snapshots[campaign].canopyDiameter / 2) * scale) + extra;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    if (selection.length) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      for (const i of selection) ring(i, 1.5, palette.selection, scale > 1 ? 1.5 : 1);
      ctx.restore();
    }

    if (activeTask) drawRoute(ctx, activeTask, palette.route);

    // Plot names once they fit.
    if (scale > 0.3) {
      ctx.font = `600 ${Math.round(Math.min(15, 9 + scale * 3))}px Geist, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const plot of farm.plots) {
        const [sx, sy] = toScreen(plot.centroid.x, plot.centroid.y);
        if (sx < -50 || sy < -20 || sx > width + 50 || sy > height + 20) continue;
        ctx.lineWidth = 4;
        ctx.strokeStyle = palette.ground;
        ctx.strokeText(`Parcela ${plot.id}`, sx, sy);
        ctx.fillStyle = palette.label;
        ctx.fillText(`Parcela ${plot.id}`, sx, sy);
      }
    }

    if (hover) ring(hover.index, 2, palette.ink, 1.5);
    if (tree !== null) {
      ring(tree, 3, palette.ground, 5);
      ring(tree, 3, palette.ink, 2);
    }

    const g = gesture.current;
    if (g?.kind === 'rect') {
      ctx.fillStyle = theme === 'dark' ? 'rgba(122,162,255,.12)' : 'rgba(47,95,208,.1)';
      ctx.strokeStyle = palette.route;
      ctx.lineWidth = 1;
      const x = Math.min(g.startX, g.x), y = Math.min(g.startY, g.y);
      ctx.fillRect(x, y, Math.abs(g.x - g.startX), Math.abs(g.y - g.startY));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(g.x - g.startX), Math.abs(g.y - g.startY));
    }

    function drawRoute(ctx: CanvasRenderingContext2D, task: Task, colour: string) {
      ctx.save();
      ctx.beginPath();
      const [gx, gy] = toScreen(farm.gate.x, farm.gate.y);
      ctx.moveTo(gx, gy);
      for (const i of task.route) ctx.lineTo(...toScreen(farm.trees[i].x, farm.trees[i].y));
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(gx, gy, 5, 0, Math.PI * 2);
      ctx.fill();
      const showNumbers = scale > 2.2 && task.route.length <= 400;
      task.route.forEach((i, k) => {
        const [sx, sy] = toScreen(farm.trees[i].x, farm.trees[i].y);
        if (sx < -20 || sy < -20 || sx > width + 20 || sy > height + 20) return;
        const outcome = task.results[i];
        ctx.beginPath();
        ctx.arc(sx, sy, showNumbers ? 8 : 3, 0, Math.PI * 2);
        ctx.fillStyle = outcome === 'confirmado' ? STATUS[theme][2] : outcome === 'falso' ? STATUS[theme][0] : colour;
        ctx.fill();
        if (showNumbers) {
          ctx.fillStyle = '#fff';
          ctx.font = '600 9px Geist, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), sx, sy + 0.5);
        }
      });
      ctx.restore();
    }
  }, [twin]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  const fit = useCallback((bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const { width, height } = size.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY))));
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, scale };
  }, []);

  useLayoutEffect(() => {
    const el = canvas.current!, box = wrap.current!;
    const observer = new ResizeObserver(() => {
      const { width, height } = box.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { width, height };
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      if (!fitted.current && width > 0) {
        const b = twin.farm.bounds;
        camera.current = fit({ minX: b.minX - 20, minY: b.minY - 20, maxX: b.maxX + 20, maxY: b.maxY + 20 });
        fitted.current = true;
      }
      draw();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [draw, fit, twin]);

  useEffect(schedule, [schedule, colours, campaign, tree, selection, activeTask, hover, theme]);

  // Fly to whatever the rest of the app points at.
  useEffect(() => {
    if (!focus) return;
    const from = { ...camera.current };
    const to = fit(focus);
    to.scale = Math.min(to.scale, 8);
    if (reducedMotion()) {
      camera.current = to;
      schedule();
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const e = 1 - (1 - t) ** 3;
      const scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * e);
      camera.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, scale };
      draw();
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focus, fit, draw, schedule]);

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const [wx, wy] = toWorld(sx, sy);
    const c = camera.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale * factor));
    const { width, height } = size.current;
    camera.current = { scale, x: wx - (sx - width / 2) / scale, y: wy + (sy - height / 2) / scale };
    schedule();
  };

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvas.current!.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top] as const;
  };

  const hit = (sx: number, sy: number) => {
    const [wx, wy] = toWorld(sx, sy);
    return twin.grid.nearest(wx, wy, Math.max(8 / camera.current.scale, 3.5));
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    canvas.current!.setPointerCapture(event.pointerId);
    const [x, y] = local(event);
    pointers.current.set(event.pointerId, { x, y });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y) };
    } else if (selectMode || event.shiftKey) {
      gesture.current = { kind: 'rect', startX: x, startY: y, x, y, additive: event.shiftKey || event.metaKey || event.ctrlKey };
    } else {
      gesture.current = { kind: 'pan', startX: x, startY: y, moved: false, shift: event.metaKey || event.ctrlKey };
    }
    setHover(null);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = local(event);
    const previous = pointers.current.get(event.pointerId);
    const g = gesture.current;
    if (!previous || !g) {
      if (event.pointerType !== 'mouse') return;
      const index = hit(x, y);
      setHover(current => (index < 0 ? null : current?.index === index ? { ...current, x, y } : { index, x, y }));
      return;
    }
    pointers.current.set(event.pointerId, { x, y });
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, distance / g.distance);
      g.distance = distance;
    } else if (g.kind === 'pan') {
      if (Math.hypot(x - g.startX, y - g.startY) > 4) g.moved = true;
      if (g.moved) {
        camera.current.x -= (x - previous.x) / camera.current.scale;
        camera.current.y += (y - previous.y) / camera.current.scale;
        schedule();
      }
    } else if (g.kind === 'rect') {
      g.x = x;
      g.y = y;
      schedule();
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size) return;
    gesture.current = null;
    if (g?.kind === 'pan' && !g.moved) {
      const index = hit(g.startX, g.startY);
      if (g.shift && index >= 0) select([index], 'toggle');
      else openTree(index >= 0 ? index : null);
    } else if (g?.kind === 'rect') {
      const [ax, ay] = toWorld(Math.min(g.startX, g.x), Math.max(g.startY, g.y));
      const [bx, by] = toWorld(Math.max(g.startX, g.x), Math.min(g.startY, g.y));
      if (Math.abs(g.x - g.startX) > 3 && Math.abs(g.y - g.startY) > 3) {
        const found: number[] = [];
        twin.grid.rect(ax, ay, bx, by, i => found.push(i));
        select(found, g.additive ? 'add' : 'replace');
      }
      schedule();
    }
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    const [x, y] = local(event);
    zoomAt(x, y, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)));
  };

  // Wheel listeners from React are passive; the page must not scroll under the map.
  useEffect(() => {
    const el = canvas.current!;
    const stop = (event: globalThis.WheelEvent) => event.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { width, height } = size.current;
    const step = 80 / camera.current.scale;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => { camera.current.x -= step; schedule(); },
      ArrowRight: () => { camera.current.x += step; schedule(); },
      ArrowUp: () => { camera.current.y += step; schedule(); },
      ArrowDown: () => { camera.current.y -= step; schedule(); },
      '+': () => zoomAt(width / 2, height / 2, 1.4),
      '=': () => zoomAt(width / 2, height / 2, 1.4),
      '-': () => zoomAt(width / 2, height / 2, 1 / 1.4),
      '0': () => { const b = twin.farm.bounds; camera.current = fit({ minX: b.minX - 20, minY: b.minY - 20, maxX: b.maxX + 20, maxY: b.maxY + 20 }); schedule(); },
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const hovered = hover ? twin.farm.trees[hover.index] : null;
  const hoveredAnomaly = hover ? primaryAnomaly(anomalies[hover.index]) : null;
  const hoveredValue = hover ? describeValue(layer, twin, campaign, hover.index, euros(lossKg[hover.index], assumptions)) : null;

  return (
    <div
      ref={wrap}
      className={`farm-map${selectMode ? ' is-selecting' : ''}`}
      tabIndex={0}
      role="application"
      aria-label="Mapa de la finca. Arrastra para moverte, rueda o pellizco para acercar, flechas y + − desde el teclado, 0 para ver toda la finca."
      onKeyDown={onKeyDown}
    >
      <canvas
        ref={canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={onWheel}
        onDoubleClick={event => zoomAt(...local(event), 2)}
      />
      {hovered && hover && (
        <div className="map-tooltip" style={{ transform: `translate(${Math.min(hover.x + 14, size.current.width - 230)}px, ${hover.y + 14}px)` }} role="status">
          <strong>Olivo {hovered.id}</strong>
          <span>{hovered.variety} · Parcela {twin.farm.plots[hovered.plot].id}</span>
          {hoveredValue && <span>{hoveredValue}</span>}
          {hoveredAnomaly && <span className={`tooltip-flag is-${status[hover.index]}`}>{ANOMALY_INFO[hoveredAnomaly.type].label}</span>}
        </div>
      )}
    </div>
  );
}
