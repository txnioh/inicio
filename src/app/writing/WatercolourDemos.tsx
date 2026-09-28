import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import * as brush from '../acuarela/brushes';
import { hexLab, mixLab, random, rgb, type Lab } from '../acuarela/kit';
import { directions } from '../acuarela/oil';
import { layDown, plan, prepare } from '../acuarela/paint';
import { calm, cluster, downsample, settle, type Grid } from '../acuarela/plan';
import { lookFor, type StyleId } from '../acuarela/style';
import type { Scene } from '../acuarela/understand';
import { InkButton, InkSlider } from './InkControls';

type Point = [number, number];
type Rng = ReturnType<typeof random>;

const PHOTO = '/carrete/instagram/C-m0owIt5PF-02.webp';
const PAINTING = '/acuarela/sample-watercolour.webp';
// The sample photo's depth, measured once by the app's model, so these
// examples don't download it.
const DEPTH = '/acuarela/sample-depth.webp';
const PAPER = '#faf9f5';

const image = (src: string) => {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
};

let sample: Promise<Scene> | null = null;
/** The sample photo read the way the app reads a photo: colour and depth, at the depth map's size. */
function sampleScene() {
  sample ??= Promise.all([image(PHOTO), image(DEPTH)]).then(([photo, depth]) => {
    const { width, height } = depth;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(depth, 0, 0);
    const near = ctx.getImageData(0, 0, width, height).data;
    ctx.drawImage(photo, 0, 0, width, height);
    const color = ctx.getImageData(0, 0, width, height).data;
    const values = new Float32Array(width * height);
    for (let i = 0; i < values.length; i++) values[i] = near[i * 4] / 255;
    return { width, height, color, depth: values };
  });
  return sample;
}

/** A canvas drawn at the screen's density; `draw` gets a context in CSS pixels. */
function useBoard(width: number, height: number, draw: ((ctx: CanvasRenderingContext2D) => void) | null, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !draw) return;
    const density = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(density, 0, 0, density, 0, 0);
    draw(ctx);
  }, deps);
  return ref;
}

function useScene() {
  const [scene, setScene] = useState<Scene | null>(null);
  useEffect(() => { void sampleScene().then(setScene); }, []);
  return scene;
}

const css = (lab: Lab) => `rgb(${rgb(lab).join(' ')})`;

// ---------------------------------------------------------------------------
// The photo and its painting, split by a handle.

export function CompareDemo() {
  const [split, setSplit] = useState(50);
  return <figure className="ink-demo ink-hero">
    <div className="wc-compare" style={{ '--split': `${split}%` } as CSSProperties}>
      <img src={PAINTING} alt="The photo painted in watercolour" width={1279} height={1600} />
      <img className="wc-compare-photo" src={PHOTO} alt="A wooded park, with a pale parasol in one corner" width={1279} height={1600} />
      <span className="wc-compare-handle" aria-hidden="true" />
      <input type="range" min={0} max={100} value={split} aria-label="Photo and painting"
        aria-valuetext={`${split}% photo`} onChange={event => setSplit(event.currentTarget.valueAsNumber)} />
    </div>
    <figcaption>Drag across: the photo, and what the app paints from it.</figcaption>
  </figure>;
}

// ---------------------------------------------------------------------------
// A wash: one shape, deformed and stacked in thin layers.

function blob(cx: number, cy: number, r: number, rng: Rng, sides = 9): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = i / sides * Math.PI * 2;
    const k = r * rng.range(.8, 1.15);
    return [cx + Math.cos(a) * k, cy + Math.sin(a) * k * .72];
  });
}

/** Splits every edge and pushes the new point off by up to `amount` of the edge's length. */
function deform(points: Point[], rounds: number, amount: number, rng: Rng) {
  let out = points;
  for (let round = 0; round < rounds; round++) {
    const next: Point[] = [];
    out.forEach((a, i) => {
      const b = out[(i + 1) % out.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      next.push(a, [(a[0] + b[0]) / 2 + rng.gaussian(0, length * amount), (a[1] + b[1]) / 2 + rng.gaussian(0, length * amount)]);
    });
    out = next;
  }
  return out;
}

function fillPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fill();
}

/** A wash on `ctx`: the shape deformed once, then each thin layer deformed again. Texture lets paper through in soft patches. */
function wash(ctx: CanvasRenderingContext2D, shape: Point[], color: string, seed: number, layers: number, texture: boolean) {
  const rng = random(seed);
  const base = deform(shape, 3, .28, rng);
  const layer = document.createElement('canvas');
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const lctx = layer.getContext('2d')!;
  lctx.setTransform(ctx.getTransform());
  const opacity = layers === 1 ? .85 : Math.min(.5, 1.6 / layers);
  for (let i = 0; i < layers; i++) {
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, 9999, 9999);
    lctx.fillStyle = color;
    fillPath(lctx, deform(base, 4, layers === 1 ? 0 : .2, rng));
    if (texture) {
      lctx.globalCompositeOperation = 'destination-out';
      const [cx, cy] = base.reduce(([x, y], p) => [x + p[0] / base.length, y + p[1] / base.length], [0, 0]);
      for (let k = 0; k < 14; k++) {
        const x = cx + rng.gaussian(0, 70), y = cy + rng.gaussian(0, 45), r = rng.range(8, 34);
        const soft = lctx.createRadialGradient(x, y, 0, x, y, r);
        soft.addColorStop(0, 'rgba(0,0,0,.9)');
        soft.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = soft;
        lctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
}

export function WashDemo() {
  const [layers, setLayers] = useState(30);
  const [texture, setTexture] = useState(true);
  const [seed, setSeed] = useState(3);
  const board = useBoard(550, 250, ctx => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, 550, 250);
    wash(ctx, blob(275, 125, 115, random(seed)), '#3f6fb0', seed, layers, texture);
  }, [layers, texture, seed]);
  return <figure className="ink-demo">
    <div className="ink-board"><canvas ref={board} className="wc-canvas" width={550} height={250} role="img"
      aria-label={`A blue wash of ${layers} layer${layers === 1 ? '' : 's'}${texture ? ', with paper showing through' : ''}`} /></div>
    <div className="ink-demo-controls">
      <InkSlider label="Layers" ariaLabel="Layers" value={layers} min={1} max={40} ink="#3f6fb0"
        onChange={event => setLayers(event.currentTarget.valueAsNumber)} />
      <InkButton ink="#3f6fb0" icon="layers" aria-pressed={texture} onClick={() => setTexture(!texture)}>Paper texture</InkButton>
      <InkButton ink="#3f6fb0" icon="stroke" onClick={() => setSeed(seed + 1)}>New wash</InkButton>
    </div>
  </figure>;
}

// ---------------------------------------------------------------------------
// Light adds up; paint takes away.

function washLayer(color: string, seed: number) {
  const canvas = document.createElement('canvas');
  const density = Math.min(2, devicePixelRatio || 1);
  canvas.width = 260 * density;
  canvas.height = 200 * density;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(density, 0, 0, density, 0, 0);
  wash(ctx, blob(130, 100, 78, random(seed), 8), color, seed, 24, true);
  return canvas;
}

export function MixDemo() {
  const [offset, setOffset] = useState(62);
  const washes = useRef<[HTMLCanvasElement, HTMLCanvasElement] | null>(null);
  washes.current ??= [washLayer('#f2c230', 5), washLayer('#2f6fd6', 8)];
  const draw = (paint: boolean) => (ctx: CanvasRenderingContext2D) => {
    const [yellow, blue] = washes.current!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = paint ? PAPER : '#0d0d0c';
    ctx.fillRect(0, 0, 260, 200);
    ctx.globalCompositeOperation = paint ? 'multiply' : 'lighter';
    ctx.drawImage(yellow, -60, 0, 260, 200);
    ctx.drawImage(blue, -60 + offset * 1.2, 0, 260, 200);
  };
  const light = useBoard(260, 200, draw(false), [offset]);
  const pigment = useBoard(260, 200, draw(true), [offset]);
  const drag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!event.buttons) return;
    const box = event.currentTarget.getBoundingClientRect();
    setOffset(Math.round(Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width * 260 - 70) / 1.2))));
  };
  return <figure className="ink-demo">
    <div className="ink-blend-comparison">
      {([['Light', light], ['Paint', pigment]] as const).map(([name, ref]) => <div key={name}>
        <div className="ink-blend-label">{name}</div>
        <div className="ink-board"><canvas ref={ref} className="wc-canvas wc-drag" width={260} height={200} onPointerDown={drag} onPointerMove={drag}
          role="img" aria-label={`A yellow and a blue wash overlapping as ${name.toLowerCase()}`} /></div>
      </div>)}
    </div>
    <div className="ink-demo-controls">
      <InkSlider label="Blue wash" ariaLabel="Move the blue wash" value={offset} min={0} max={100} ink="#2f6fd6"
        onChange={event => setOffset(event.currentTarget.valueAsNumber)} />
    </div>
  </figure>;
}

// ---------------------------------------------------------------------------
// The photo divided into its own shapes of colour, as the app does it.

type Shapes = { grid: Grid; labels: Uint8Array; colours: Lab[] };

function shapesOf(scene: Scene, k: number, depthWeight: number): Shapes {
  const grid = downsample(scene, 2);
  const labels = calm(cluster(settle(grid, 3, .07), grid.depth, k, depthWeight, random(1)), grid.width, grid.height, 2, k);
  const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
  labels.forEach((label, c) => {
    for (let i = 0; i < 3; i++) sums[label][i] += grid.lab[c * 3 + i];
    sums[label][3]++;
  });
  return { grid, labels, colours: sums.map(([l, a, b, n]) => n ? [l / n, a / n, b / n] as Lab : [1, 0, 0]) };
}

function paintCells(ctx: CanvasRenderingContext2D, grid: Grid, colourOf: (c: number) => Lab, width: number, height: number) {
  const pixels = new ImageData(grid.width, grid.height);
  for (let c = 0; c < grid.width * grid.height; c++) pixels.data.set([...rgb(colourOf(c)), 255], c * 4);
  const small = document.createElement('canvas');
  small.width = grid.width;
  small.height = grid.height;
  small.getContext('2d')!.putImageData(pixels, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, width, height);
}

const PORTRAIT = [300, 375] as const;

export function ShapesDemo() {
  const scene = useScene();
  const [k, setK] = useState(6);
  const [photo, setPhoto] = useState(false);
  const shapes = useRef<{ k: number; value: Shapes } | null>(null);
  const board = useBoard(...PORTRAIT, scene && (ctx => {
    if (photo) return void image(PHOTO).then(img => ctx.drawImage(img, 0, 0, ...PORTRAIT));
    if (shapes.current?.k !== k) shapes.current = { k, value: shapesOf(scene, k, 0) };
    const { grid, labels, colours } = shapes.current.value;
    paintCells(ctx, grid, c => colours[labels[c]], ...PORTRAIT);
  }), [scene, k, photo]);
  return <figure className="ink-demo">
    <div className="ink-board wc-portrait"><canvas ref={board} className="wc-canvas" width={300} height={375} role="img"
      aria-label={photo ? 'The photo' : `The photo divided into ${k} colours`} /></div>
    <div className="ink-demo-controls">
      <InkSlider label="Colours" ariaLabel="Number of colours" value={k} min={2} max={16} ink="#6f9c46"
        onChange={event => setK(event.currentTarget.valueAsNumber)} />
      <InkButton ink="#6f9c46" aria-pressed={photo} onClick={() => setPhoto(!photo)}>Photo</InkButton>
    </div>
  </figure>;
}

// ---------------------------------------------------------------------------
// Distance: measured, then faded towards the paper.

export function DepthDemo() {
  const scene = useScene();
  const [haze, setHaze] = useState(70);
  const [map, setMap] = useState(false);
  const shapes = useRef<Shapes | null>(null);
  const paper = hexLab(PAPER);
  const board = useBoard(...PORTRAIT, scene && (ctx => {
    shapes.current ??= shapesOf(scene, 8, 1);
    const { grid, labels, colours } = shapes.current;
    paintCells(ctx, grid, c => map ? [.25 + .7 * grid.depth[c], 0, 0]
      : mixLab(colours[labels[c]], paper, haze / 100 * .75 * (1 - grid.depth[c]) ** 1.5), ...PORTRAIT);
  }), [scene, haze, map]);
  return <figure className="ink-demo">
    <div className="ink-board wc-portrait"><canvas ref={board} className="wc-canvas" width={300} height={375} role="img"
      aria-label={map ? 'How far each part of the photo is: near is light, far is dark' : 'The shapes, fading into the paper with distance'} /></div>
    <div className="ink-demo-controls">
      <InkSlider label="Haze" ariaLabel="Distance haze" value={haze} min={0} max={100} suffix="%" ink="#8e7cc3"
        onChange={event => setHaze(event.currentTarget.valueAsNumber)} />
      <InkButton ink="#8e7cc3" aria-pressed={map} onClick={() => setMap(!map)}>Depth map</InkButton>
    </div>
  </figure>;
}

// ---------------------------------------------------------------------------
// The real painter, stroke by stroke.

export function OrderDemo() {
  const [style, setStyle] = useState<StyleId>('watercolour');
  const [run, setRun] = useState(0);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);

  // Paints only once scrolled to: it's the real engine, and heavy.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { rootMargin: '200px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let stopped = false;
    void (async () => {
      const scene = await sampleScene();
      const painting = await plan(scene, run + 1, 900, lookFor(style));
      const canvas = ref.current;
      if (stopped || !canvas) return;
      canvas.width = painting.width;
      canvas.height = painting.height;
      const ctx = canvas.getContext('2d')!;
      const surface = prepare(painting);
      const total = painting.strokes.length + painting.marks.length;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Spread over about three seconds, so the order shows.
      const perFrame = still ? total : Math.max(1, Math.ceil(total / 180));
      for (let i = 0; i < total && !stopped;) {
        const end = Math.min(total, i + perFrame);
        while (i < end) layDown(painting, i++);
        brush.flush();
        ctx.drawImage(surface, 0, 0);
        setProgress(i / total);
        await new Promise(requestAnimationFrame);
      }
    })();
    return () => { stopped = true; };
  }, [visible, style, run]);

  return <figure className="ink-demo">
    <div className="ink-board wc-portrait"><canvas ref={ref} className="wc-canvas" width={720} height={900} role="img"
      aria-label={`The photo being painted, ${Math.round(progress * 100)}% done`} /></div>
    <div className="ink-demo-controls">
      <div className="ink-choices" role="group" aria-label="Style">
        {(['watercolour', 'oil'] as const).map(id => <InkButton key={id} ink="#c0392b" aria-pressed={style === id}
          onClick={() => setStyle(id)}>{id[0].toUpperCase() + id.slice(1)}</InkButton>)}
      </div>
      <InkButton ink="#c0392b" icon="replay" onClick={() => setRun(run + 1)}>Paint again</InkButton>
    </div>
  </figure>;
}

// ---------------------------------------------------------------------------
// The oil sketch's strokes: which way each one runs.

export function DirectionDemo() {
  const scene = useScene();
  const [follow, setFollow] = useState(100);
  const board = useBoard(...PORTRAIT, scene && (ctx => {
    const grid = downsample(scene, 4);
    const light = new Float32Array(grid.width * grid.height);
    for (let i = 0; i < light.length; i++) light[i] = grid.lab[i * 3];
    const along = directions(light, grid.width, grid.height, follow / 100, -90, 7);
    const scale = PORTRAIT[0] / grid.width;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, ...PORTRAIT);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    for (let y = 4; y < grid.height; y += 8) for (let x = 4; x < grid.width; x += 8) {
      const c = y * grid.width + x;
      const [dx, dy] = [along[c * 2] * 3, along[c * 2 + 1] * 3];
      ctx.strokeStyle = css([grid.lab[c * 3], grid.lab[c * 3 + 1], grid.lab[c * 3 + 2]]);
      ctx.beginPath();
      ctx.moveTo((x - dx) * scale, (y - dy) * scale);
      ctx.lineTo((x + dx) * scale, (y + dy) * scale);
      ctx.stroke();
    }
  }), [scene, follow]);
  return <figure className="ink-demo">
    <div className="ink-board wc-portrait"><canvas ref={board} className="wc-canvas" width={300} height={375} role="img"
      aria-label="Short strokes in the photo's colours, showing which way the brush would run" /></div>
    <div className="ink-demo-controls">
      <InkSlider label="Follow forms" ariaLabel="How closely strokes follow the forms" value={follow} min={0} max={200} suffix="%" ink="#b8724e"
        onChange={event => setFollow(event.currentTarget.valueAsNumber)} />
    </div>
  </figure>;
}
