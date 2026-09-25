import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { PixelSprite } from '../components/PixelSprite';
import { robotSkins, setRobotSkin, useRobotSkin } from '../components/robotSkin';
import PixelText from '../trenes/PixelText';
import { drawText, measure } from '../trenes/pixelType';
import { drawBubble } from './pixelFont';
import { animations, BAYER, FPS, H, renderFrame, spriteSheet, W, type Env } from './sprites';
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
// The frame ruler: one tick per frame, every other art pixel.
const RULER_H = 5;
const COUNTER_W = measure('00/00');

const ICONS = {
  previous: ['#...#', '#..##', '#.###', '#..##', '#...#'],
  next: ['#...#', '##..#', '###.#', '##..#', '#...#'],
  play: ['#..', '##.', '###', '##.', '#..'],
  pause: ['##.##', '##.##', '##.##', '##.##', '##.##'],
  download: ['..#..', '..#..', '#.#.#', '.###.', '..#..', '.....', '#####'],
} as const;

// A spotlight behind the robot: a dithered beam that thickens towards a
// solid pool of light on the floor. Drawn underneath the frame's pixels.
function backdrop(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#eeede7';
  [[20, 10], [21, 11], [22, 9]].forEach(([y, half]) => ctx.fillRect(16 - half, y, half * 2, 1));
  ctx.fillStyle = '#f4f3ee';
  for (let y = 0; y < 20; y++) {
    const half = Math.round(3 + y * .34);
    const density = .06 + y / 20 * .4;
    for (let x = 16 - half; x < 16 + half; x++) if (BAYER[y % 4][x % 4] / 16 < density) ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

export default function Robot() {
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(reducedMotion);
  const [scale, setScale] = useState(8);
  const stage = useRef<HTMLCanvasElement>(null);
  const bubble = useRef<HTMLCanvasElement>(null);
  const ruler = useRef<HTMLCanvasElement>(null);
  const counter = useRef<HTMLCanvasElement>(null);
  const skin = useRobotSkin();
  const stageBox = useRef<HTMLDivElement>(null);
  const thumbs = useRef<(HTMLCanvasElement | null)[]>([]);
  const look = useRef<[number, number] | null>(null);
  const visible = useRef(new Set<number>());
  const clock = useRef({ frame: 0, stage: 0 });
  const animation = animations[selected];

  // Drawn directly so the page does not re-render on every animation frame:
  // a ruler with a tick per frame (played ones darker, the current one tall)
  // and a pixel counter.
  const showFrame = (index: number, total: number) => {
    const bar = ruler.current?.getContext('2d');
    if (bar && ruler.current) {
      if (ruler.current.width !== total * 2) ruler.current.width = total * 2;
      bar.clearRect(0, 0, total * 2, RULER_H);
      for (let i = 0; i < total; i++) {
        bar.fillStyle = i === index ? '#111' : i < index ? '#9d9c96' : '#dcdbd5';
        bar.fillRect(i * 2, i === index ? 0 : 2, 1, i === index ? RULER_H : RULER_H - 2);
      }
    }
    const text = counter.current?.getContext('2d');
    if (text) {
      const label = `${String(index + 1).padStart(2, '0')}/${total}`;
      text.clearRect(0, 0, COUNTER_W, 8);
      drawText(text, label, COUNTER_W - measure(label), 0, '#9d9c96');
    }
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
      if (ctx) { renderFrame(ctx, animation, clock.current.stage, env); backdrop(ctx); }
      // Type the line out a few letters per frame, like the footer robot's speech.
      const speech = bubble.current?.getContext('2d');
      // Some animations speak through the drawing itself and have no line.
      if (speech && animation.line) drawBubble(speech, animation.line, paused ? Infinity : clock.current.stage * 3, BUBBLE_W, BUBBLE_H);
      else speech?.clearRect(0, 0, BUBBLE_W, BUBBLE_H);
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
    if (ctx) { renderFrame(ctx, animation, clock.current.stage, { look: null, now: new Date() }); backdrop(ctx); }
    showFrame(clock.current.stage, animation.frames);
  };

  // Scrub: pressing the ruler jumps to that frame.
  const scrub = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const frame = Math.max(0, Math.min(animation.frames - 1, Math.floor((event.clientX - box.left) / box.width * animation.frames)));
    step(frame - clock.current.stage);
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
          <h1 aria-label="Robot"><PixelText text="robot" unit={3} /></h1>
          <p aria-label={`${animations.length} animaciones en pixel art, a ${FPS} fps`}>
            <PixelText text={`${animations.length} animaciones · ${FPS} fps`} unit={2} />
          </p>
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
            aria-label={`Robot en pixel art: ${animation.label}${animation.line ? `. Dice: ${animation.line}` : ''}`}
            title="Siguiente animación"
          />
        </div>

        <div className="robot-deck">
          <div className="robot-controls">
            <button type="button" onClick={() => select(selected - 1)} aria-label="Animación anterior" title="Anterior (←)">
              <PixelSprite rows={ICONS.previous} />
            </button>
            <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Reproducir' : 'Pausa'} title="Pausa (espacio)">
              <PixelSprite rows={paused ? ICONS.play : ICONS.pause} />
            </button>
            <button type="button" onClick={() => select(selected + 1)} aria-label="Animación siguiente" title="Siguiente (→)">
              <PixelSprite rows={ICONS.next} />
            </button>
          </div>
          <h2 className="robot-name" aria-live="polite" aria-label={animation.label}>
            <PixelText key={animation.id} text={animation.label.toLocaleLowerCase()} unit={3} reveal={!reducedMotion} />
          </h2>
          <button type="button" className="robot-download" onClick={download} aria-label="Descargar sprite sheet" title="Sprite sheet">
            <PixelSprite rows={ICONS.download} />
          </button>
        </div>

        <div className="robot-timeline" title="Fotograma a fotograma: , y .">
          <canvas ref={ruler} className="robot-ruler" width={animation.frames * 2} height={RULER_H}
            style={{ '--frames': animation.frames } as CSSProperties}
            onPointerDown={scrub} aria-hidden="true" />
          <canvas ref={counter} className="robot-counter" width={COUNTER_W} height={8} aria-hidden="true" />
        </div>

        <fieldset className="robot-skin" aria-label="Skin del robot de inicio">
          <PixelText text="skin" unit={2} className="robot-skin-title" />
          {robotSkins.map(option => (
            <label key={option} data-on={skin === option || undefined}>
              <input className="minimal-hidden-nav" type="radio" name="robot-skin" value={option}
                checked={skin === option} onChange={() => setRobotSkin(option)} />
              <PixelText text={`${skin === option ? '→ ' : ''}${option === 'pixel' ? 'pixel' : 'normal'}`} unit={2} />
            </label>
          ))}
        </fieldset>

        <ul className="robot-grid">
          {animations.map((item, index) => (
            <li key={item.id}>
              <button type="button" aria-pressed={index === selected} onClick={() => select(index)} aria-label={item.label} title={item.label}>
                <canvas ref={node => { thumbs.current[index] = node; }} data-index={index} width={W} height={H} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
