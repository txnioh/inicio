// Pixel-art version of the footer robot (RobotFace): a round dark screen with
// two pill eyes. It is drawn chunky, on a 32×24 grid with integer rectangles,
// so the canvas can be scaled up with nearest-neighbour sampling.

export const W = 32;
export const H = 24;
export const FPS = 12;
const GY = 20;
const CX = 16;

const C = {
  screen: '#484846',
  screenHi: '#5c5c59',
  eye: '#fdfdfc',
  ink: '#8e8e91',
  shadow: 'rgba(0, 0, 0, .07)',
  purple: '#918bd6',
  blue: '#91b4cc',
  pink: '#e79ab0',
  yellow: '#e6c46a',
  green: '#8fcfa3',
  red: '#e0786c',
  hole: '#555551',
};

type Ctx = CanvasRenderingContext2D;
type Sprite = readonly string[];
export type Env = { look: [number, number] | null; now: Date };

const mirror = (sprite: Sprite) => sprite.map(row => [...row].reverse().join(''));

function sprite(ctx: Ctx, rows: Sprite, x: number, y: number, color: string) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = color;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i, y + j, 1, 1);
  });
}

function roundRows(w: number, h: number, r: number) {
  return Array.from({ length: h }, (_, j) => {
    const d = j < r ? r - j - .5 : j >= h - r ? j - (h - r) + .5 : 0;
    return d > 0 ? Math.max(0, Math.ceil(r - Math.sqrt(r * r - d * d) - .3)) : 0;
  });
}

function round(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  roundRows(w, h, r).forEach((inset, j) => ctx.fillRect(x + inset, y + j, w - inset * 2, 1));
}

// Stepped fades keep translucent particles looking like pixel art.
const fade = (value: number) => Math.max(0, Math.min(1, Math.round(value * 4) / 4));
const tri = (f: number, period: number) => {
  const p = ((f % period) + period) % period / period;
  return p < .5 ? p * 2 : 2 - p * 2;
};
const wave = (f: number, period: number, amp: number) => Math.round(Math.sin(f / period * Math.PI * 2) * amp);
const pick = <T,>(f: number, values: readonly T[]) => values[((f % values.length) + values.length) % values.length];
function random(seed: number) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

// Eyes are anchored to a 2×4 box, the classic face's pill eyes in chunky
// pixels. Wider sprites are centred on the box, leaning outwards.
type EyeSprite = { rows: Sprite; dy?: number; color?: string };
const EYE_W = 2;
const EYE_H = 4;
const OPEN: Sprite = ['##', '##', '##', '##'];
const sadBrow: Sprite = ['.#', '#.', '..', '##', '##'];
const angryBrow: Sprite = ['#.', '.#', '..', '##', '##'];
const eyes = {
  open: { rows: OPEN },
  half: { rows: ['..', '..', '##', '##'] },
  closed: { rows: ['..', '..', '##', '..'] },
  happy: { rows: ['...', '.#.', '#.#', '...'] },
  wide: { rows: ['##', '##', '##', '##', '##', '##'], dy: -1 },
  heart: { rows: ['#.#', '###', '.#.'], dy: 1, color: C.pink },
  heartBig: { rows: ['##.##', '#####', '.###.', '..#..'], color: C.pink },
  cross: { rows: ['#.#', '.#.', '#.#'] },
  star: { rows: ['.#.', '###', '#.#'], dy: 1, color: C.yellow },
  greater: { rows: ['#.', '.#', '#.'] },
  less: { rows: ['.#', '#.', '.#'] },
  sadL: { rows: sadBrow, dy: -2 },
  sadR: { rows: mirror(sadBrow), dy: -2 },
  angryL: { rows: angryBrow, dy: -2 },
  angryR: { rows: mirror(angryBrow), dy: -2 },
  dot: { rows: ['..', '##'], dy: 1 },
  none: { rows: [] },
} satisfies Record<string, EyeSprite>;
const eyeX = (cx: number, side: 'left' | 'right') => side === 'left' ? cx - 3 : cx + 1;
type Eye = keyof typeof eyes;

type Screen = { x: number; y: number; w: number; h: number; cx: number; cy: number };
type Pose = {
  // dw/dh squash and stretch the body around its 14×8 rest size.
  dx?: number; dy?: number; dw?: number; dh?: number;
  eyes?: Eye | [Eye, Eye]; look?: [number, number]; eyeColor?: string;
  screen?: string; shadow?: number | false;
  fx?: (ctx: Ctx, screen: Screen) => void;
};

// The footer robot has no ground shadow; its activities turn it off.
let groundShadow = true;

function shadow(ctx: Ctx, width: number) {
  if (!groundShadow || width <= 4) return;
  ctx.fillStyle = C.shadow;
  ctx.fillRect(CX - width / 2, GY, width, 1);
  ctx.fillRect(CX - width / 2 + 2, GY + 1, width - 4, 1);
}

// The robot is all screen, like the footer face without its shell: a round,
// borderless dark body that is itself the display the eyes and effects live on.
const RADIUS = 4;

function robot(ctx: Ctx, pose: Pose = {}): Screen {
  const w = 14 + (pose.dw ?? 0);
  const h = 8 + (pose.dh ?? 0);
  const x = Math.round(CX - w / 2 + (pose.dx ?? 0));
  const y = Math.round(GY - h + (pose.dy ?? 0));
  if (pose.shadow !== false) shadow(ctx, pose.shadow ?? w - 2);

  const screen = { x, y, w, h, cx: x + Math.round(w / 2), cy: y + Math.floor(h / 2) };
  round(ctx, x, y, w, h, RADIUS, pose.screen ?? C.screen);
  ctx.fillStyle = C.screenHi;
  ctx.fillRect(x + 2, y + 1, 2, 1);

  ctx.save();
  ctx.beginPath();
  roundRows(w, h, RADIUS).forEach((inset, j) => ctx.rect(x + inset, y + j, w - inset * 2, 1));
  ctx.clip();
  const [left, right] = Array.isArray(pose.eyes) ? pose.eyes : [pose.eyes ?? 'open', pose.eyes ?? 'open'];
  const [lx, ly] = pose.look ?? [0, 0];
  const top = y + Math.floor((h - EYE_H) / 2) + ly;
  const drawEye = (name: Eye, side: 'left' | 'right') => {
    const eye: EyeSprite = eyes[name];
    const width = Math.max(0, ...eye.rows.map(row => row.length));
    const centre = (side === 'left' ? Math.floor : Math.ceil)((EYE_W - width) / 2);
    sprite(ctx, eye.rows, eyeX(screen.cx, side) + lx + centre, top + (eye.dy ?? 0), eye.color ?? pose.eyeColor ?? C.eye);
  };
  drawEye(left, 'left');
  drawEye(right, 'right');
  pose.fx?.(ctx, screen);
  ctx.restore();
  return screen;
}

// Small glyphs used around the robot.
export const G = {
  z: ['###', '..#', '.#.', '###'],
  note: ['.##', '.#.', '##.', '##.'],
  heart: ['#.#', '###', '.#.'],
  drop: ['.#.', '###', '.#.'],
  tear: ['#'],
  sparkle: ['.#.', '#.#', '.#.'],
  plus: ['.#.', '###', '.#.'],
  bang: ['#', '#', '.', '#'],
  puff: ['.#.', '###'],
  bolt: ['.#', '##', '#.'],
  bubble: ['.###.', '#...#', '.###.'],
};
const DIGITS: Sprite[] = [
  ['###', '#.#', '#.#', '#.#', '###'], ['.#.', '##.', '.#.', '.#.', '###'], ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'], ['#.#', '#.#', '###', '..#', '..#'], ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'], ['###', '..#', '.#.', '.#.', '.#.'], ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
];

function alpha(ctx: Ctx, value: number, draw: () => void) {
  const a = fade(value);
  if (!a) return;
  ctx.save();
  ctx.globalAlpha = a;
  draw();
  ctx.restore();
}

// Particles that rise from a point and fade out; copies are staggered.
function rising(ctx: Ctx, f: number, period: number, count: number, draw: (p: number, rise: number, i: number) => void) {
  for (let i = 0; i < count; i++) {
    const p = ((f + i * period / count) % period) / period;
    alpha(ctx, p < .2 ? p * 5 : 1 - (p - .2) / .8, () => draw(p, Math.round(p * 8), i));
  }
}

let scratch: HTMLCanvasElement | null = null;
function offscreen(draw: (ctx: Ctx) => void) {
  scratch ??= document.createElement('canvas');
  scratch.width = W;
  scratch.height = H;
  const ctx = scratch.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  draw(ctx);
  return scratch;
}

let robotPixels: { x: number; y: number; color: string }[] | null = null;
function pixelsOf() {
  if (robotPixels) return robotPixels;
  const canvas = offscreen(ctx => robot(ctx, { shadow: false }));
  const data = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
  robotPixels = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (data[i + 3] > 0) robotPixels.push({ x, y, color: `rgb(${data[i]} ${data[i + 1]} ${data[i + 2]})` });
  }
  return robotPixels;
}

// The portal: a hole opens under the robot, which squashes, drops in with
// growing speed and pops back out of the next hole with a little overshoot.
// Shared by the Portal animation and the footer robot's pixel skin.
export const PORTAL_FRAMES = 14;

export function drawPortal(ctx: Ctx, kind: 'leaving' | 'arriving', f: number) {
  ctx.clearRect(0, 0, W, H);
  const open = f < 2 ? (f + 1) / 2 : f < 11 ? 1 : (13 - f) / 3;
  if (open > 0) {
    const w = Math.max(2, Math.round(16 * open / 2) * 2);
    ctx.fillStyle = C.hole;
    ctx.fillRect(CX - w / 2 + 1, GY - 1, w - 2, 1);
    ctx.fillRect(CX - w / 2, GY, w, 1);
    ctx.fillRect(CX - w / 2 + 1, GY + 1, w - 2, 1);
  }
  const leaving = kind === 'leaving';
  const sink = leaving
    ? f < 3 ? 0 : f < 11 ? Math.round(((f - 2) / 8) ** 2 * 11) : 11
    : f < 2 ? 11 : f < 10 ? Math.round((1 - (f - 2) / 8) ** 2 * 11) - (f === 9 ? 1 : 0) : 0;
  const squash = f === (leaving ? 2 : 10);
  const eyes: Eye = leaving ? f >= 3 ? 'wide' : 'open' : f < 10 ? 'wide' : f === 11 ? 'closed' : 'open';
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, GY);
  ctx.clip();
  robot(ctx, { dy: sink, dw: squash ? 2 : 0, dh: squash ? -1 : 0, eyes, shadow: false });
  ctx.restore();
}

export type Animation = {
  id: string;
  label: string;
  line: string;
  frames: number;
  draw: (ctx: Ctx, f: number, env: Env) => void;
};

const idleLook = (f: number): [number, number] => f >= 14 && f < 24 ? [-1, 0] : f >= 26 && f < 34 ? [1, -1] : [0, 0];
const blink = (f: number, at: number): Eye => f === at || f === at + 2 ? 'half' : f === at + 1 ? 'closed' : 'open';

export const animations: Animation[] = [
  {
    id: 'idle', label: 'Reposo', line: 'ey, qué pasa', frames: 48,
    draw: (ctx, f, env) => robot(ctx, { eyes: blink(f, 42), look: env.look ?? idleLook(f) }),
  },
  {
    id: 'wink', label: 'Guiño', line: 'esto queda entre nosotros', frames: 24,
    draw: (ctx, f) => {
      const on = f >= 3 && f < 17;
      robot(ctx, { dx: on ? 1 : 0, eyes: on ? ['open', f < 5 ? 'half' : 'closed'] : 'open' });
      if (on && f >= 5) alpha(ctx, f < 13 ? 1 : (17 - f) / 4, () => sprite(ctx, f % 4 < 2 ? G.plus : G.sparkle, 24, 8, C.yellow));
    },
  },
  {
    id: 'happy', label: 'Feliz', line: 'esto sí que sí', frames: 24,
    draw: (ctx, f) => {
      const t = f % 12;
      const hop = [0, -1, -2, -3, -3, -2, -1, 0, 0, 0, 0, 0][t];
      const squash = t === 0 || t === 7;
      robot(ctx, { dy: hop, dw: squash ? 2 : 0, dh: squash ? -1 : 0, eyes: 'happy', shadow: 12 + hop });
      if (t >= 2 && t <= 6) { sprite(ctx, G.sparkle, 4, 9 + hop, C.yellow); sprite(ctx, G.sparkle, 25, 8 + hop, C.yellow); }
    },
  },
  {
    id: 'surprised', label: 'Sorpresa', line: 'uy, no te había visto', frames: 24,
    draw: (ctx, f) => {
      const hop = f > 3 && f < 9 ? [-1, -2, -3, -2, -1][f - 4] : 0;
      const squash = f === 3 || f === 9;
      robot(ctx, { dy: hop, dw: squash ? 2 : 0, dh: squash ? -1 : 0, eyes: f < 3 ? 'open' : 'wide', shadow: 12 + hop });
      if (f >= 4 && (f < 18 || f % 2)) sprite(ctx, G.bang, 23, 5 + Math.min(0, hop), C.red);
    },
  },
  {
    id: 'sleep', label: 'Dormir', line: 'cinco minutitos más', frames: 48,
    draw: (ctx, f) => {
      const inhale = f % 24 < 12;
      robot(ctx, { dh: inhale ? 0 : -1, dw: inhale ? 0 : 2, eyes: 'closed', screen: '#3f3f3d' });
      rising(ctx, f, 48, 2, (p, rise) => sprite(ctx, G.z, 23 + p * 5, 10 - rise, C.ink));
    },
  },
  {
    id: 'music', label: 'Bailar', line: 'este temazo no se salta', frames: 64,
    draw: (ctx, f) => {
      robot(ctx, dance(f));
      rising(ctx, f, 16, 2, (p, rise, i) => sprite(ctx, G.note, (i ? 25 : 4) + wave(p * 16, 8, 1), 11 - rise, C.purple));
    },
  },
  {
    id: 'carried', label: 'En brazos', line: 'con cuidadito, eh', frames: 12,
    draw: (ctx, f) => {
      const dx = f % 2 ? 1 : -1;
      robot(ctx, { dx, dy: -4 + (f % 4 < 2 ? 0 : -1), eyes: 'wide', shadow: 8 });
      for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 2; i++) {
        const p = ((f + i * 6) % 12) / 12;
        alpha(ctx, 1 - p, () => sprite(ctx, G.drop, CX + dx + side * (9 + p * 4) - 1, 9 + i * 3 - p * 2, C.blue));
      }
    },
  },
  {
    id: 'love', label: 'Amor', line: 'contigo, sin ruido', frames: 24,
    draw: (ctx, f) => {
      const big = f % 12 < 3;
      robot(ctx, { dy: big ? -1 : 0, eyes: big ? 'heartBig' : 'heart' });
      rising(ctx, f, 24, 3, (p, rise, i) => sprite(ctx, G.heart, [5, 24, 14][i] + wave(p * 24, 12, 1), 10 - rise, C.pink));
    },
  },
  {
    id: 'dizzy', label: 'Mareo', line: 'todo da vueltas, tipo mucho', frames: 24,
    draw: (ctx, f) => {
      const stars = [0, 1, 2].map(i => {
        const a = f / 24 * Math.PI * 2 + i * Math.PI * 2 / 3;
        return { x: CX + Math.round(Math.cos(a) * 7) - 1, y: 8 + Math.round(Math.sin(a) * 1.5), back: Math.sin(a) < 0 };
      });
      stars.filter(s => s.back).forEach(s => alpha(ctx, .5, () => sprite(ctx, G.plus, s.x, s.y, C.yellow)));
      robot(ctx, { dx: pick(f >> 1, [-1, 0, 1, 0]), eyes: f % 12 < 6 ? 'cross' : 'dot' });
      stars.filter(s => !s.back).forEach(s => sprite(ctx, G.sparkle, s.x, s.y, C.yellow));
    },
  },
  {
    id: 'angry', label: 'Enfado', line: 'vale vale, ya está bien', frames: 24,
    draw: (ctx, f) => {
      const hot = f % 8 < 4;
      robot(ctx, { dx: f % 2 ? 1 : 0, eyes: ['angryL', 'angryR'], screen: hot ? '#5a3c39' : C.screen, eyeColor: hot ? '#ffd9d3' : C.eye });
      rising(ctx, f, 12, 2, (p, rise, i) => sprite(ctx, G.puff, i ? 22 + p * 2 : 7 - p * 2, 9 - rise / 2, '#d8d7d2'));
    },
  },
  {
    id: 'sad', label: 'Tristeza', line: 'hoy no es mi día, la verdad', frames: 36,
    draw: (ctx, f) => {
      robot(ctx, { eyes: ['sadL', 'sadR'] });
      const p = (f % 18) / 18;
      alpha(ctx, p < .8 ? 1 : (1 - p) * 5, () => sprite(ctx, G.tear, 13, 17 + Math.round(p * p * 4), C.blue));
    },
  },
  {
    id: 'tickle', label: 'Cosquillas', line: 'jajaja para para', frames: 12,
    draw: (ctx, f) => {
      robot(ctx, { dx: f % 2 ? 1 : -1, dy: f % 3 ? 0 : -1, eyes: ['greater', 'less'] });
      if (f % 6 < 3) { sprite(ctx, G.sparkle, 3, 10, C.yellow); sprite(ctx, G.plus, 26, 13, C.yellow); }
      else { sprite(ctx, G.plus, 4, 14, C.yellow); sprite(ctx, G.sparkle, 25, 9, C.yellow); }
    },
  },
  {
    id: 'think', label: 'Pensar', line: 'lo suyo sería…', frames: 48,
    draw: (ctx, f) => {
      const idea = f >= 34;
      robot(ctx, { eyes: idea ? 'wide' : f % 16 === 8 ? 'half' : 'open', look: idea ? [0, 0] : [1, -1], dy: idea && f < 38 ? -1 : 0 });
      if (!idea) {
        if (f >= 4) sprite(ctx, ['#'], 23, 10, C.ink);
        if (f >= 8) sprite(ctx, ['#'], 24, 8, C.ink);
        if (f >= 12) {
          sprite(ctx, G.bubble, 24, 3, C.ink);
          for (let i = 0; i < 3; i++) if ((f >> 2) % 4 > i) sprite(ctx, ['#'], 25 + i, 4, C.ink);
        }
      } else {
        sprite(ctx, G.bang, 24, 3 - (f < 38 ? 1 : 0), C.yellow);
        if (f % 4 < 2) { sprite(ctx, G.sparkle, 21, 2, C.yellow); sprite(ctx, G.sparkle, 26, 5, C.yellow); }
      }
    },
  },
  {
    id: 'scan', label: 'Escáner', line: 'todo en su sitio, sin ruido', frames: 36,
    draw: (ctx, f) => {
      const scanning = f < 22;
      robot(ctx, {
        eyes: scanning ? 'none' : f < 24 ? 'half' : 'open', look: scanning ? [0, 0] : pick(f >> 2, [[0, 0], [-1, 0], [-1, 0], [1, 0]]) as [number, number],
        fx: (c, s) => {
          if (!scanning) return;
          c.fillStyle = C.green;
          c.fillRect(s.x + Math.round(tri(f, 22) * (s.w - 1)), s.y, 1, s.h);
        },
      });
      if (scanning) alpha(ctx, .5, () => { ctx.fillStyle = C.green; ctx.fillRect(5, GY + 1, 22, 1); });
    },
  },
  {
    id: 'loading', label: 'Cargando', line: 'dame un seg que cargo', frames: 16,
    draw: (ctx, f) => robot(ctx, {
      eyes: 'none',
      fx: (c, s) => {
        const ring = [[0, -2], [1, -1], [2, 0], [1, 1], [0, 2], [-1, 1], [-2, 0], [-1, -1]];
        ring.forEach(([x, y], i) => {
          const age = ((f >> 1) - i + 8) % 8;
          c.globalAlpha = age === 0 ? 1 : age === 1 ? .75 : age === 2 ? .5 : .2;
          c.fillStyle = C.eye;
          c.fillRect(s.cx - 1 + x, s.cy + y, 1, 1);
        });
        c.globalAlpha = 1;
      },
    }),
  },
  {
    id: 'glitch', label: 'Glitch', line: 'eso no ha pasado', frames: 24,
    draw: (ctx, f) => {
      const hit = f % 12 >= 7;
      const frame = offscreen(c => robot(c, { eyes: hit ? ['open', 'half'] : blink(f, 3), shadow: false, screen: hit && f % 2 ? '#3d4a58' : C.screen }));
      shadow(ctx, 12);
      if (!hit) { ctx.drawImage(frame, 0, 0); return; }
      const rand = random(f);
      for (let y = 0; y < H; y++) {
        const shift = rand() < .3 ? Math.round((rand() - .5) * 4) : 0;
        ctx.drawImage(frame, 0, y, W, 1, shift, y, W, 1);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = .5;
      ctx.fillStyle = f % 2 ? '#8ff' : '#f8f';
      ctx.fillRect(8 + Math.round((rand() - .5) * 4), 12 + Math.floor(rand() * 8), 16, 1);
      ctx.restore();
    },
  },
  {
    id: 'boot', label: 'Encender', line: 'apagar y encender, clásico', frames: 48,
    draw: (ctx, f) => {
      const off = f < 4 || f >= 44;
      robot(ctx, {
        screen: '#2f2f2e', eyes: 'none',
        fx: (c, s) => {
          if (off) return;
          if (f < 7) { // CRT line opening outwards.
            const half = Math.round((f - 3) / 3 * s.w / 2);
            c.fillStyle = C.eye;
            c.fillRect(s.cx - half, s.cy, half * 2, 1);
            return;
          }
          if (f >= 40) { // Collapse back to a single dot.
            const half = Math.max(1, Math.round((43 - f) / 3 * s.w / 2));
            c.fillStyle = C.eye;
            c.fillRect(s.cx - half, s.cy, half * 2, 1);
            return;
          }
          const grow = Math.min(s.h, (f - 6) * 2);
          c.fillStyle = C.screen;
          c.fillRect(s.x, s.cy - grow / 2, s.w, grow);
          if (f < 10) return;
          const reveal = Math.min(EYE_H, f - 9);
          const top = s.y + Math.floor((s.h - EYE_H) / 2);
          const look = f >= 24 && f < 30 ? -1 : f >= 30 && f < 36 ? 1 : 0;
          const eye = f === 20 || f === 22 ? eyes.half.rows : f === 21 ? eyes.closed.rows : OPEN;
          sprite(c, eye.slice(0, reveal), eyeX(s.cx, 'left') + look, top, C.eye);
          sprite(c, eye.slice(0, reveal), eyeX(s.cx, 'right') + look, top, C.eye);
        },
      });
      if (f >= 7 && f < 12) sprite(ctx, G.bolt, 24, 6, C.yellow);
    },
  },
  {
    // Hours, then minutes: two chunky digits fit on the screen at a time.
    id: 'clock', label: 'Hora', line: 'hora de madrid', frames: 36,
    draw: (ctx, f, env) => {
      const [hh, mm] = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Madrid' })
        .format(env.now).split(':');
      const digits = f < 16 ? hh : f < 20 ? null : mm;
      robot(ctx, {
        eyes: 'none', dw: 2, dh: 1, dy: 0,
        fx: (c, s) => {
          if (!digits) {
            sprite(c, ['#', '.', '#'], s.cx - 1, s.cy - 1, C.eye);
            return;
          }
          [digits[0], digits[1]].forEach((d, i) => sprite(c, DIGITS[+d], s.cx - 4 + i * 4, s.cy - 2, C.eye));
        },
      });
    },
  },
  {
    id: 'portal', label: 'Portal', line: 'vuelvo enseguida', frames: 40,
    draw: (ctx, f) => {
      if (f >= 4 && f < 4 + PORTAL_FRAMES) drawPortal(ctx, 'leaving', f - 4);
      else if (f >= 22 && f < 22 + PORTAL_FRAMES) drawPortal(ctx, 'arriving', f - 22);
      else if (f < 4 || f >= 22) robot(ctx, { shadow: false });
    },
  },
  {
    id: 'party', label: 'Fiesta', line: 'fiesta de píxeles, dale', frames: 24,
    draw: (ctx, f) => {
      const colors = [C.purple, C.pink, C.yellow, C.green, C.blue];
      const rand = random(7);
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(rand() * W);
        const speed = 1 + Math.floor(rand() * 2);
        const y = (Math.floor(rand() * H) + f * speed) % (GY + 1);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, y, 1, 1);
      }
      robot(ctx, { dy: f % 6 < 3 ? -1 : 0, eyes: f % 12 < 6 ? 'happy' : 'star', screen: pick(f >> 1, ['#4a4466', '#5a3f52', '#4d4a39', '#3d5145', '#3c4a57']) });
    },
  },
  {
    id: 'battery', label: 'Sin batería', line: 'al 1%, como siempre', frames: 60,
    draw: (ctx, f) => {
      const low = f < 30;
      robot(ctx, {
        dy: low && f > 16 ? 1 : 0, dh: low && f > 16 ? -1 : 0, dw: low && f > 16 ? 2 : 0,
        eyes: low ? (f < 10 ? 'half' : 'closed') : f < 36 ? 'wide' : 'happy',
        eyeColor: low ? '#b8b8b4' : undefined,
      });
      // Battery icon above the head.
      const x = 13, y = 4;
      sprite(ctx, ['#####.', '#...##', '#####.'], x, y, C.ink);
      const level = low ? (f % 8 < 4 ? 1 : 0) : Math.min(3, (f - 30) >> 2);
      ctx.fillStyle = low ? C.red : C.green;
      ctx.fillRect(x + 1, y + 1, level, 1);
      if (!low && f < 46) sprite(ctx, G.bolt, x + 7, y, C.yellow);
    },
  },
  {
    id: 'code', label: 'Programar', line: 'arreglando, no mitigando', frames: 32,
    draw: (ctx, f) => {
      robot(ctx, {
        eyes: 'none',
        fx: (c, s) => {
          const rand = random(3);
          const lines = Array.from({ length: 12 }, () => ({ indent: Math.floor(rand() * 2) * 2, parts: [1 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2)] }));
          const scroll = f >> 1;
          for (let row = 0; row < 3; row++) {
            const line = lines[(row + scroll) % lines.length];
            let x = s.x + 3 + line.indent;
            line.parts.forEach((len, i) => {
              c.fillStyle = [C.purple, C.green, C.eye][(i + row) % 3];
              c.fillRect(x, s.y + 1 + row * 2, Math.min(len, s.x + s.w - 3 - x), 1);
              x += len + 1;
            });
          }
        },
      });
    },
  },
  {
    id: 'sneeze', label: 'Estornudo', line: 'achís, alergia a los bugs', frames: 36,
    draw: (ctx, f) => {
      const build = f < 14;
      const burst = f >= 14 && f < 18;
      robot(ctx, {
        dx: burst ? 1 : 0, dy: build && f > 6 ? -1 : 0,
        dw: burst ? 2 : 0, dh: burst ? -1 : build && f > 8 ? 1 : 0,
        eyes: build ? (f < 6 ? 'open' : f < 10 ? 'half' : 'closed') : burst ? ['greater', 'less'] : f < 26 ? blink(f, 22) : 'open',
      });
      if (f >= 14 && f < 24) {
        const p = (f - 14) / 10;
        const rand = random(11);
        for (let i = 0; i < 6; i++) {
          const angle = (rand() - .5) * 1.4 + Math.PI;
          const dist = 4 + p * (5 + rand() * 6);
          alpha(ctx, 1 - p, () => { ctx.fillStyle = i % 2 ? C.blue : '#cfe0ea'; ctx.fillRect(Math.round(CX - 3 + Math.cos(angle) * dist), Math.round(15 + Math.sin(angle) * dist), 1, 1); });
        }
      }
    },
  },
  {
    id: 'rebuild', label: 'Desmontar', line: 'vamos a hacerlo de nuevo', frames: 48,
    draw: (ctx, f) => {
      if (f < 6 || f >= 42) {
        robot(ctx, { eyes: f >= 42 && f < 45 ? blink(f, 42) : 'open', dy: f === 42 ? -1 : 0 });
        return;
      }
      const t = f < 24 ? (f - 6) / 18 : 1 - (f - 24) / 18;
      const ease = t * t * (3 - 2 * t);
      shadow(ctx, Math.round(12 * (1 - ease) / 2) * 2);
      pixelsOf().forEach(({ x, y, color }, i) => {
        const rand = random(i + 1);
        const vx = (x - CX) / 3 + (rand() - .5) * 3;
        const vy = (y - 15) / 2 - rand() * 4;
        const px = x + vx * ease * 1.5;
        const py = Math.min(GY + 1, y + vy * ease * 1.5 + 20 * ease * ease * (rand() * .6));
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      });
    },
  },
  {
    id: 'stretch', label: 'Estirarse', line: 'estirando los píxeles', frames: 36,
    draw: (ctx, f) => {
      // Up on tiptoe, hold it with a happy face, then settle with a squash.
      const up = f < 6 ? 0 : f < 12 ? f - 5 : f < 24 ? 6 : f < 30 ? 29 - f : 0;
      const tall = Math.min(3, up >> 1);
      const settle = f === 30 || f === 31;
      robot(ctx, {
        dh: settle ? -1 : tall, dw: settle ? 2 : -tall, eyes: f < 6 ? 'open' : f < 24 ? (f < 18 ? 'closed' : 'happy') : blink(f, 32),
      });
      if (f >= 18 && f < 24) { sprite(ctx, G.sparkle, 5, 6, C.yellow); sprite(ctx, G.sparkle, 24, 5, C.yellow); }
    },
  },
  {
    id: 'coffee', label: 'Café', line: 'café primero, commits después', frames: 48,
    draw: (ctx, f) => {
      const sip = f >= 18 && f < 30;
      robot(ctx, { dx: sip ? 1 : 0, look: sip ? [0, 0] : [2, 0], eyes: sip ? 'closed' : f >= 30 && f < 40 ? 'happy' : 'open' });
      sprite(ctx, ['#####.', '####.#', '####.#', '#####.', '.###..'], 24, GY - 5, '#c98e69');
      sprite(ctx, ['####'], 24, GY - 5, '#8a5a3c');
      rising(ctx, f, 16, 2, (p, rise, i) => alpha(ctx, 1 - p, () => sprite(ctx, ['#', '.', '#'], 25 + i * 2 + wave(p * 16, 8, 1), GY - 8 - rise, '#d8d7d2')));
      if (f >= 30 && f < 40) sprite(ctx, G.heart, 4, 9 - ((f - 30) >> 2), C.pink);
    },
  },
  {
    id: 'wish', label: 'Deseo', line: 'pide un deseo, rápido', frames: 40,
    draw: (ctx, f) => {
      // A shooting star crosses above; the eyes follow it.
      const t = Math.max(0, Math.min(1, (f - 4) / 22));
      const sx = Math.round(1 + t * 28);
      const sy = Math.round(2 + t * 5);
      const flying = f >= 4 && f < 27;
      robot(ctx, {
        look: flying ? [Math.round(t * 4 - 2), -1] : [0, 0],
        eyes: f >= 28 && f < 36 ? 'star' : f >= 36 ? blink(f, 37) : 'open',
      });
      if (flying) {
        for (let k = 1; k <= 3; k++) alpha(ctx, 1 - k / 4, () => { ctx.fillStyle = C.yellow; ctx.fillRect(sx - k * 2, sy - Math.round(k * .5), 2, 1); });
        sprite(ctx, G.plus, sx - 1, sy - 1, C.yellow);
      }
      if (f >= 27 && f < 31) sprite(ctx, G.sparkle, 28, 7, C.yellow);
    },
  },
  {
    id: 'bubble', label: 'Pompa', line: 'pop', frames: 40,
    draw: (ctx, f) => {
      const popped = f >= 28;
      const r = Math.min(3, 1 + ((f - 4) >> 3));
      const rise = f < 12 ? 0 : (f - 12) >> 1;
      const bx = 26, by = 14 - rise;
      robot(ctx, { look: popped ? [0, 0] : [2, f < 12 ? 0 : -1], eyes: popped ? (f < 32 ? 'wide' : 'happy') : 'open', dy: f === 28 ? -1 : 0 });
      if (f >= 4 && !popped) {
        ctx.fillStyle = C.blue;
        for (let a = 0; a < 16; a++) {
          const x = Math.round(bx + Math.cos(a / 16 * Math.PI * 2) * r);
          const y = Math.round(by + Math.sin(a / 16 * Math.PI * 2) * r);
          ctx.fillRect(x, y, 1, 1);
        }
        ctx.fillStyle = C.eye;
        if (r > 1) ctx.fillRect(bx - 1, by - 1, 1, 1);
      }
      if (popped && f < 34) {
        const k = f - 28;
        [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -2], [2, 0], [-2, 0]].forEach(([x, y]) =>
          alpha(ctx, 1 - k / 6, () => { ctx.fillStyle = C.blue; ctx.fillRect(bx + x * (2 + (k >> 1)), by + y * (2 + (k >> 1)), 1, 1); }));
      }
    },
  },
  {
    id: 'hiccup', label: 'Hipo', line: 'hip… perdón', frames: 40,
    draw: (ctx, f) => {
      const hics = [6, 18, 30];
      const k = hics.map(at => f - at).find(d => d >= 0 && d < 5);
      const hop = k === undefined ? 0 : [-1, -2, -2, -1, 0][k];
      const squash = k === 4;
      robot(ctx, { dy: hop, dw: squash ? 2 : 0, dh: squash ? -1 : 0, eyes: k !== undefined && k < 3 ? 'wide' : f > 34 ? 'half' : 'open' });
      if (k !== undefined && k < 4) sprite(ctx, G.bubble, 23, 8 + hop, C.ink);
    },
  },
  {
    id: 'lookaround', label: 'Curiosear', line: 'hay alguien por ahí?', frames: 40,
    draw: (ctx, f) => {
      const look: [number, number] = f < 4 ? [0, 0] : f < 13 ? [-2, 0] : f < 15 ? [0, 0] : f < 24 ? [2, 0] : f < 32 ? [0, -1] : [0, 0];
      robot(ctx, { look, dx: look[0] > 0 ? 1 : look[0] < 0 ? -1 : 0, eyes: f === 13 || f === 33 ? 'half' : f === 32 ? 'closed' : 'open' });
      if (f >= 26 && f < 32) sprite(ctx, ['###', '..#', '.##', '...', '.#.'], 24, 4, C.ink);
    },
  },
  {
    id: 'paint', label: 'Pintar', line: 'no escatimes en detalles', frames: 48,
    draw: (ctx, f) => {
      // One pixel of a heart every other frame, then admire it.
      const art = eyes.heartBig.rows;
      const cells = art.flatMap((row, y) => [...row].map((c, x) => c === '#' ? [x, y] : null)).filter(Boolean) as number[][];
      const shown = Math.min(cells.length, Math.max(0, (f - 4) >> 1));
      const done = shown === cells.length;
      robot(ctx, { dx: -2, look: done ? [0, 0] : [2, (shown >> 2) % 2 ? 0 : 1], eyes: done && f > 40 ? 'happy' : 'open' });
      cells.slice(0, shown).forEach(([x, y]) => { ctx.fillStyle = C.pink; ctx.fillRect(23 + x, 12 + y, 1, 1); });
      if (!done && f >= 4 && f % 2) { const [x, y] = cells[shown]; ctx.fillStyle = C.ink; ctx.fillRect(23 + x, 11 + y, 1, 1); }
      if (done && f % 4 < 2) sprite(ctx, G.sparkle, 28, 8, C.yellow);
    },
  },
];

// A 64-frame routine: sway, two hops, a spin, headbanging and stretches.
function dance(f: number): Pose {
  const t = f % 64;
  if (t < 16) {
    const beat = t % 4 === 0;
    return {
      dx: pick(t, [-1, -1, -1, 0, 0, 1, 1, 1, 1, 0, -1, -1, 1, 1, 0, 0]), dy: beat ? 0 : -1,
      dw: beat ? 2 : 0, dh: beat ? -1 : 0, eyes: t % 8 < 4 ? 'happy' : 'open',
    };
  }
  if (t < 24) {
    const squash = t % 4 === 0;
    return { dy: [0, -2, -2, -1][t % 4], dw: squash ? 2 : 0, dh: squash ? -1 : 0, eyes: squash ? 'happy' : 'wide' };
  }
  if (t < 32) {
    // The eyes slide off one side and come back from the other while the
    // body narrows, like turning around.
    const k = t - 24;
    return { look: [[-1, -2, -4, -7, 7, 4, 2, 0][k], 0], dw: -[0, 2, 2, 4, 4, 2, 2, 0][k], eyes: 'open' };
  }
  if (t < 48) {
    const down = t % 2 === 1;
    return { dx: (t - 32) % 8 < 4 ? -1 : 1, dy: down ? 1 : 0, dw: down ? 2 : 0, dh: down ? -1 : 0, eyes: t % 4 < 2 ? 'closed' : 'happy' };
  }
  const tall = (t - 48) % 4 < 2;
  return { dx: wave(t - 48, 8, 1), dw: tall ? -2 : 2, dh: tall ? 1 : -1, eyes: tall ? 'wide' : 'happy' };
}

// The footer robot's moods, drawn without a ground shadow. Activities (and
// `play:` gestures) run an animation from the list once; this returns true
// when one has finished. `look` points the resting eyes at the cursor.
export function drawFace(ctx: Ctx, expression: string, f: number, look: [number, number] = [0, 0]) {
  ctx.clearRect(0, 0, W, H);
  const played = expression.startsWith('activity:') ? expression.slice(9) : expression.startsWith('play:') ? expression.slice(5) : null;
  const animation = played && animations.find(item => item.id === played);
  if (animation) {
    groundShadow = false;
    animation.draw(ctx, Math.min(f, animation.frames - 1), { look: null, now: new Date() });
    groundShadow = true;
    return f >= animation.frames - 1;
  }
  const pose: Pose = { shadow: false };
  if (expression === 'wink') Object.assign(pose, { dx: 1, eyes: ['open', 'closed'] });
  else if (expression === 'happy') Object.assign(pose, { dy: f % 6 < 3 ? -1 : 0, eyes: 'happy' });
  else if (expression === 'surprised') Object.assign(pose, { dy: -1, eyes: 'wide' });
  else if (expression === 'sleeping') Object.assign(pose, { dw: f % 32 < 16 ? 0 : 2, dh: f % 32 < 16 ? 0 : -1, eyes: 'closed' });
  else if (expression === 'carried') Object.assign(pose, { dx: f % 2 ? 1 : -1, eyes: 'wide' });
  // Pressed flat: a first squash, then squeezed eyes and a tiny tremble.
  else if (expression === 'pressed') Object.assign(pose, f < 2
    ? { dw: 2, dh: -1, look }
    : { dw: 4, dh: -2, dx: f > 12 && f % 4 === 0 ? 1 : 0, eyes: ['greater', 'less'] });
  else if (expression === 'music') Object.assign(pose, dance(f));
  else Object.assign(pose, { look, eyes: blink(f % 64, 60) }); // Same rhythm as the classic face's 5.4s blink.
  robot(ctx, pose);
  return false;
}

export function renderFrame(ctx: Ctx, animation: Animation, frame: number, env: Env) {
  ctx.clearRect(0, 0, W, H);
  animation.draw(ctx, frame % animation.frames, env);
}

export function spriteSheet(animation: Animation, scale = 8) {
  const canvas = document.createElement('canvas');
  canvas.width = W * animation.frames * scale;
  canvas.height = H * scale;
  const sheet = canvas.getContext('2d')!;
  sheet.imageSmoothingEnabled = false;
  const frame = document.createElement('canvas');
  frame.width = W;
  frame.height = H;
  const ctx = frame.getContext('2d')!;
  const env = { look: null, now: new Date() };
  for (let i = 0; i < animation.frames; i++) {
    renderFrame(ctx, animation, i, env);
    sheet.drawImage(frame, i * W * scale, 0, W * scale, H * scale);
  }
  return canvas;
}
