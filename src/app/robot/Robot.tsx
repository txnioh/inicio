import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import RobotSkinSelector from '../components/RobotSkinSelector';
import { drawBubble } from './pixelFont';
import { animations, FPS, H, renderFrame, spriteSheet, W, type Env } from './sprites';
import './robot.css';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

// The bubble text uses pixels half the robot's size, so it has room to read.
const BUBBLE_W = W * 2;
const BUBBLE_H = 26;
// The robot canvas keeps headroom for particles; tuck the bubble into it.
const BUBBLE_OVERLAP = 6;

export default function Robot() {
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(reducedMotion);
  const [scale, setScale] = useState(8);
  const stage = useRef<HTMLCanvasElement>(null);
  const bubble = useRef<HTMLCanvasElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const stageBox = useRef<HTMLDivElement>(null);
  const thumbs = useRef<(HTMLCanvasElement | null)[]>([]);
  const look = useRef<[number, number] | null>(null);
  const visible = useRef(new Set<number>());
  const clock = useRef({ frame: 0, stage: 0 });
  const animation = animations[selected];

  // Written directly so the page does not re-render on every animation frame.
  const showFrame = (index: number, total: number) => {
    if (counter.current) counter.current.textContent = `${String(index + 1).padStart(2, '0')}/${total}`;
  };

  const select = useCallback((index: number) => {
    setSelected((index + animations.length) % animations.length);
    clock.current.stage = 0;
  }, []);

  useEffect(() => {
    const title = document.title;
    document.title = 'Robot';
    return () => { document.title = title; };
  }, []);

  useEffect(() => setPaused(reducedMotion), [reducedMotion]);

  // Keep the pixel grid crisp: only ever scale the canvases by whole numbers
  // (an even one, so the half-size bubble pixels stay whole too).
  useEffect(() => {
    const box = stageBox.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.max(6, Math.min(18, Math.floor(entry.contentRect.width / BUBBLE_W) * 2))));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      const index = Number((entry.target as HTMLElement).dataset.index);
      if (entry.isIntersecting) visible.current.add(index);
      else visible.current.delete(index);
    }));
    thumbs.current.forEach(canvas => canvas && observer.observe(canvas));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const draw = () => {
      const env: Env = { look: animation.id === 'idle' ? look.current : null, now: new Date() };
      const ctx = stage.current?.getContext('2d');
      if (ctx) renderFrame(ctx, animation, clock.current.stage, env);
      // Type the line out a few letters per frame, like the footer robot's speech.
      const speech = bubble.current?.getContext('2d');
      if (speech) drawBubble(speech, animation.line, paused ? Infinity : clock.current.stage * 3, BUBBLE_W, BUBBLE_H);
      thumbs.current.forEach((canvas, index) => {
        if (!canvas || (!visible.current.has(index) && clock.current.frame > 0)) return;
        const thumb = canvas.getContext('2d');
        if (thumb) renderFrame(thumb, animations[index], paused ? 0 : clock.current.frame, { look: null, now: env.now });
      });
      showFrame(clock.current.stage % animation.frames, animation.frames);
    };
    draw();
    if (paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / FPS) return;
      last = now - ((now - last) % (1000 / FPS));
      clock.current.frame++;
      clock.current.stage++;
      draw();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animation, paused]);

  const step = (delta: number) => {
    setPaused(true);
    clock.current.stage = (clock.current.stage + delta + animation.frames) % animation.frames;
    const ctx = stage.current?.getContext('2d');
    if (ctx) renderFrame(ctx, animation, clock.current.stage, { look: null, now: new Date() });
    showFrame(clock.current.stage, animation.frames);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return;
      if (event.key === 'ArrowRight') select(selected + 1);
      else if (event.key === 'ArrowLeft') select(selected - 1);
      else if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); setPaused(value => !value); }
      else if (event.key === '.') step(1);
      else if (event.key === ',') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * W - W / 2;
    const y = (event.clientY - box.top) / box.height * H - 16;
    look.current = [Math.max(-2, Math.min(2, Math.round(x / 4))), Math.max(-1, Math.min(1, Math.round(y / 4)))];
  };

  const download = () => {
    spriteSheet(animation).toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `robot-${animation.id}-${animation.frames}f.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
  };

  return (
    <main className="minimal-portfolio-page robot-page" tabIndex={-1}>
      <div className="minimal-portfolio-shell robot-shell">
        <header className="robot-header">
          <a className="minimal-basic-link" href="/">Index</a>
          <h1>Robot</h1>
          <p>{animations.length} animaciones en pixel art, a {FPS} fps.</p>
        </header>

        <div className="robot-stage" ref={stageBox}>
          <canvas ref={bubble} width={BUBBLE_W} height={BUBBLE_H} style={{ width: BUBBLE_W * scale / 2, height: BUBBLE_H * scale / 2, marginBottom: -BUBBLE_OVERLAP * scale / 2 }} aria-hidden="true" />
          <canvas
            ref={stage}
            width={W}
            height={H}
            style={{ width: W * scale, height: H * scale }}
            onPointerMove={onPointerMove}
            onPointerLeave={() => { look.current = null; }}
            onClick={() => select(selected + 1)}
            role="img"
            aria-label={`Robot en pixel art: ${animation.label}. Dice: ${animation.line}`}
          />
        </div>

        <div className="robot-controls">
          <button type="button" onClick={() => select(selected - 1)} aria-label="Animación anterior">←</button>
          <button type="button" onClick={() => setPaused(value => !value)}>{paused ? 'Reproducir' : 'Pausa'}</button>
          <button type="button" onClick={() => select(selected + 1)} aria-label="Animación siguiente">→</button>
          <span className="robot-meta">
            <strong>{animation.label}</strong>
            <span ref={counter} />
          </span>
          <button type="button" onClick={download}>Sprite sheet</button>
        </div>
        <p className="robot-hint">← → cambia · espacio pausa · , . fotograma a fotograma · clic en el robot para la siguiente</p>

        <section className="robot-skins" aria-labelledby="robot-skin-title">
          <h2 id="robot-skin-title">Skin</h2>
          <p>Cambia el robot de la página de inicio. Aquí se ve al doble de su tamaño.</p>
          <RobotSkinSelector previews />
        </section>

        <ul className="robot-grid">
          {animations.map((item, index) => (
            <li key={item.id}>
              <button type="button" aria-pressed={index === selected} onClick={() => select(index)}>
                <canvas ref={node => { thumbs.current[index] = node; }} data-index={index} width={W} height={H} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
