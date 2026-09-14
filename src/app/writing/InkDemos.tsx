import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildFan, buildLayerPasses, clamp, curve, dashedPieces, markerStroke, pathThrough, resample, ribbon, segmentProgress, tangents, type Point } from './ink';
import InkExample, { InkFilters, InkPaths } from './InkExample';
import { InkButton, InkSlider } from './InkControls';

function Choices<T extends string>({ label, value, options, onChange, ink, palette }: {
  label: string; value: T; options: readonly T[]; onChange: (value: T) => void;
  ink?: string; palette?: Record<string, string>;
}) {
  return <div className="ink-choices" role="group" aria-label={label}>
    {options.map(option => <InkButton key={option} ink={palette?.[option] ?? ink} aria-pressed={value === option}
      onClick={() => onChange(option)}>{option}</InkButton>)}
  </div>;
}

function Surface({ label, children, height = 210, width = 550, mode = 'full', grid = false }: {
  label: string; children: (filter: string) => ReactNode; height?: number; width?: number;
  mode?: 'plain' | 'grain' | 'full'; grid?: boolean;
}) {
  const id = `surface-${useId().replace(/:/g, '')}`;
  return <div className={`ink-board${grid ? ' ink-paper-grid' : ''}`}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <InkFilters id={id} mode={mode === 'grain' ? 'grain' : 'full'} />
      {children(mode === 'plain' ? '' : `url(#${id})`)}
    </svg>
  </div>;
}

// The drawing is built by React once. Playback only changes visibility and clipping.
// Keeping the frame clock out of React also keeps each seeded path unchanged.
function useInkPlayback(duration: number) {
  const ref = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLOutputElement>(null);
  const sliderRef = useRef<HTMLLabelElement>(null);
  const frame = useRef(0);
  const reduced = useRef(false);
  const started = useRef(false);
  const paint = useRef<(t: number) => void>(() => {});
  const replay = useCallback(() => {
    cancelAnimationFrame(frame.current);
    started.current = true;
    if (reduced.current) { paint.current(1); return; }
    paint.current(0);
    const begin = performance.now();
    const tick = (now: number) => {
      const t = clamp((now - begin) / duration);
      paint.current(t);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [duration]);
  const pause = useCallback(() => {
    started.current = true;
    cancelAnimationFrame(frame.current);
  }, []);
  const scrub = useCallback((value: number) => {
    pause();
    paint.current(clamp(value));
  }, [pause]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const segments = Array.from(root.querySelectorAll<SVGElement>('[data-ink-at]'))
      .map(element => ({ element, at: Number(element.dataset.inkAt) }));
    const wipes = Array.from(root.querySelectorAll<SVGElement>('[data-ink-wipe]'));
    paint.current = t => {
      for (const { element, at } of segments) {
        const visibility = t >= at ? 'visible' : 'hidden';
        if (element.style.visibility !== visibility) element.style.visibility = visibility;
      }
      for (const element of wipes) element.style.clipPath = `inset(0 ${(1 - t) * 100}% 0 0)`;
      if (progressRef.current) progressRef.current.value = String(Math.round(t * 100));
      if (outputRef.current) outputRef.current.value = `${Math.round(t * 100)}%`;
      sliderRef.current?.style.setProperty('--ink-progress', String(t));
      root.dataset.progress = String(Math.round(t * 100));
    };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = media.matches;
    started.current = false;
    paint.current(media.matches ? 1 : 0);
    const onMotionChange = () => {
      reduced.current = media.matches;
      if (media.matches) { cancelAnimationFrame(frame.current); paint.current(1); }
    };
    media.addEventListener('change', onMotionChange);
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && !started.current) replay();
        else if (!entry.isIntersecting && started.current) {
          cancelAnimationFrame(frame.current);
          paint.current(1);
        }
      }
    }, { threshold: .2 });
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame.current);
      observer.disconnect();
      media.removeEventListener('change', onMotionChange);
    };
  }, [replay]);
  return { ref, replay, scrub, pause, progressRef, outputRef, sliderRef };
}

export function FanDemo() {
  const runs = useMemo(() => buildFan(), []);
  const playback = useInkPlayback(3600);
  return <figure className="ink-demo ink-hero">
    <div ref={playback.ref}>
      <Surface label="A fan of blue, green and pink ink strokes opening across graph paper" height={330} grid>
        {filter => <g filter={filter} style={{ mixBlendMode: 'multiply' }}>
          {runs.map(run => <g key={run.key}>
            {run.pieces.map((paths, i) => <g key={i} data-ink-at={segmentProgress(i, run.pieces.length, run.key)}>
              <InkPaths paths={paths} />
            </g>)}
          </g>)}
        </g>}
      </Surface>
    </div>
    <figcaption className="ink-demo-footer"><span>A little ink, a lot of little paths.</span>
      <InkButton className="ink-text-button" icon="replay" onClick={playback.replay} aria-label="Replay the ink fan">Replay</InkButton>
    </figcaption>
  </figure>;
}

export function ShapeDemo() {
  const [mode, setMode] = useState<'Path' | 'Outline' | 'Ink'>('Ink');
  const points = useMemo(() => resample(curve(), 70), []);
  const outline = useMemo(() => ribbon(points, { width: 25, seed: 7 }), [points]);
  const directions = useMemo(() => tangents(points), [points]);
  return <figure className="ink-demo">
    <Surface label={`The same curved stroke shown as ${mode.toLowerCase()}`}>
      {filter => <>
        {mode === 'Ink' && <g filter={filter}><InkPaths paths={markerStroke(points, { width: 25, seed: 7 })} /></g>}
        {mode === 'Outline' && <path d={outline} fill="#918bd615" stroke="#8179bf" strokeWidth="1.2" />}
        {mode !== 'Ink' && <path d={pathThrough(points)} fill="none" stroke="#827b74" strokeWidth="1.2" strokeDasharray={mode === 'Outline' ? '3 4' : undefined} />}
        {mode !== 'Ink' && points.filter((_, i) => i % 5 === 0).map((p, i) => <g key={i}>
          {mode === 'Outline' && <line x1={p[0] - directions[i * 5][1] * 15} y1={p[1] + directions[i * 5][0] * 15}
            x2={p[0] + directions[i * 5][1] * 15} y2={p[1] - directions[i * 5][0] * 15} stroke="#8179bf" strokeWidth=".8" />}
          <circle cx={p[0]} cy={p[1]} r="2.5" fill="#8179bf" />
        </g>)}
      </>}
    </Surface>
    <div className="ink-demo-controls"><Choices label="Stroke construction" value={mode} options={['Path', 'Outline', 'Ink']} onChange={setMode} /></div>
    <figcaption>One curve. Switch to Outline to see the two edges around it.</figcaption>
  </figure>;
}

export function WobbleDemo() {
  const [seed, setSeed] = useState(7);
  const [amount, setAmount] = useState(35);
  const paths = useMemo(() => markerStroke(curve(), { width: 29, seed, wobble: amount / 100,
    edge: amount * .09, core: false, color: '#6A9BCC' }), [seed, amount]);
  return <figure className="ink-demo">
    <Surface label={`Blue stroke with ${amount} percent irregularity, seed ${seed}`} mode="plain">
      {() => <InkPaths paths={paths} />}
    </Surface>
    <div className="ink-demo-controls">
      <InkSlider label="Irregularity" ariaLabel="Stroke irregularity" value={amount} suffix="%" ink="#6A9BCC" onChange={e => setAmount(Number(e.target.value))} />
      <InkButton icon="stroke" ink="#6A9BCC" onClick={() => setSeed(s => s + 1)}>New stroke</InkButton>
    </div>
    <figcaption>Seed {seed}. Bring the slider back to the same value: the same edge returns.</figcaption>
  </figure>;
}

export function TextureDemo() {
  const [mode, setMode] = useState<'Plain' | 'Grain' | 'Grain + warp'>('Grain + warp');
  const paths = useMemo(() => markerStroke(curve(), { width: 52, seed: 23, color: '#C46686', core: false }), []);
  return <figure className="ink-demo">
    <Surface label={`Pink marker stroke with ${mode.toLowerCase()} texture`} mode={mode === 'Plain' ? 'plain' : mode === 'Grain' ? 'grain' : 'full'}>
      {filter => <g filter={filter}><InkPaths paths={paths} /></g>}
    </Surface>
    <div className="ink-demo-controls"><Choices label="Ink texture" value={mode} options={['Plain', 'Grain', 'Grain + warp']} ink="#C46686" onChange={setMode} /></div>
    <figcaption>Look inside the stroke for grain, and along the edge for displacement.</figcaption>
  </figure>;
}

export function LayersDemo() {
  const [passes, setPasses] = useState(2);
  const rows = useMemo(buildLayerPasses, []);
  return <figure className="ink-demo">
    <div className="ink-blend-comparison">
      {(['normal', 'multiply'] as const).map(mode => <div key={mode} className="ink-blend-sample">
        <div className="ink-blend-label">{mode === 'normal' ? 'Normal' : 'Multiply'}</div>
        <Surface label={`${passes} alternating blue and yellow marker passes with ${mode} blending`} width={275} height={190} mode="grain">
          {filter => <g style={{ isolation: 'isolate' }} transform={`translate(0 ${(6 - passes) * 9})`}>
            {rows.slice(0, passes).map((paths, i) => <g key={i} filter={filter} style={{ mixBlendMode: mode }}><InkPaths paths={paths} /></g>)}
          </g>}
        </Surface>
      </div>)}
    </div>
    <div className="ink-demo-controls">
      <InkSlider label="Passes" ariaLabel="Number of ink passes" min={1} max={6} value={passes} ink="#629987" onChange={e => setPasses(Number(e.target.value))} />
    </div>
    <figcaption>{passes === 1
      ? 'One pass, no overlap. Both look the same. Add a second pass.'
      : 'Same strokes, same opacity. Look at the overlap: yellow sits on blue; Multiply makes a deeper green.'}</figcaption>
  </figure>;
}

export function RevealDemo() {
  const playback = useInkPlayback(4800);
  const line: Point[] = useMemo(() => curve(550, 180), []);
  const stroke = useMemo(() => markerStroke(line, { width: 12, seed: 11, color: '#6A9BCC' }), [line]);
  const pieces = useMemo(() => dashedPieces(line, { width: 12, seed: 11, color: '#6A9BCC', dashLength: 14, gap: 7 }), [line]);
  return <figure className="ink-demo">
    <div ref={playback.ref}>
      <Surface label="Comparison of a left to right wipe and the same curve appearing segment by segment" height={330}>
        {filter => <>
          <text x="30" y="32" className="ink-svg-label">Clip reveal</text>
          <g data-ink-wipe="true"><g filter={filter}><InkPaths paths={stroke} /></g></g>
          <text x="30" y="188" className="ink-svg-label">Segments</text>
          <g transform="translate(0 155)" filter={filter}>
            {pieces.map((paths, i) => <g key={i} data-ink-at={segmentProgress(i, pieces.length, 0)}><InkPaths paths={paths} /></g>)}
          </g>
        </>}
      </Surface>
    </div>
    <div className="ink-demo-controls">
      <InkSlider label="Progress" ariaLabel="Reveal progress" inputRef={playback.progressRef} outputRef={playback.outputRef} rootRef={playback.sliderRef}
        defaultValue={100} suffix="%" ink="#6A9BCC"
        onPointerDown={playback.pause}
        onKeyDown={e => { if (['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) playback.pause(); }}
        onChange={e => playback.scrub(Number(e.target.value) / 100)} />
      <InkButton icon="replay" ink="#6A9BCC" onClick={playback.replay} aria-label="Replay the reveal comparison">Replay</InkButton>
    </div>
    <figcaption>Scrub slowly. A wipe exposes an area; the lower line adds complete marks.</figcaption>
  </figure>;
}

export function ExampleDemo() {
  const [color, setColor] = useState('Green');
  const palette: Record<string, string> = { Green: '#629987', Blue: '#6A9BCC', Rose: '#C46686' };
  return <figure className="ink-demo">
    <div className="ink-board ink-paper-grid ink-chart-example">
      <div className="ink-chart-heading"><span>Tabs I meant to close</span><span>an illustrative trend ↗</span></div>
      <InkExample color={palette[color]} />
      <div className="ink-chart-axis"><span>Monday</span><span>Friday</span></div>
    </div>
    <div className="ink-demo-controls"><Choices label="Example ink colour" value={color} options={['Green', 'Blue', 'Rose']} palette={palette} onChange={setColor} /></div>
    <figcaption>Same points, same seed. A different pen.</figcaption>
  </figure>;
}
