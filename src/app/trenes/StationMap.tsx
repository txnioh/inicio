import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { drawText, measure } from './pixelType';
import { ANNOUNCE, ARRIVE, BOARD, ENTER, LEAVE, TRACKS, around, clock, dateLabel, upcoming, type Train } from './schedule';
import { isDark } from './theme';

// Top-down plan of the hall, drawn on a small grid and scaled up by whole
// device pixels: four island platforms between eight dead-end tracks, the
// concourse along the bottom, the clock and date on either side, like the
// real boards. Trains come in from the top and leave the same way.
export const W = 248;
export const H = 56;

const TRACK = 7;
const ISLAND = 12;
const GAP = 18;
const GROUP = TRACK * 2 + ISLAND;
const LEFT = Math.floor((W - GROUP * 4 - GAP * 3) / 2);
const TOP = 12;
const BUMPER = 38;
const HALL = 43;
const HALL_H = 12;
const TRAIN = 23;
const STOP = BUMPER - TRAIN;
const OUT = -TRAIN - 2;

// Each service has its own silhouette, readable without colour: high speed
// has long pointed noses, long distance four short rounded cars, and the
// regional train is two cars with flat cabs. `gaps` are the coupler rows,
// `doors` the rows (from its top) where the doors are.
type Shape = { length: number; gaps: number[]; nose: (j: number, length: number) => [number, number] | null; doors: number[]; lights: number };
const full: [number, number] = [0, 5];
const SHAPES: Record<Train['service'], Shape> = {
  AV: {
    length: TRAIN, gaps: [7, 15], doors: [2, 10, 18], lights: 1,
    nose: (j, n) => (j === 0 || j === n - 1 ? [2, 1] : j === 1 || j === n - 2 ? [1, 3] : null),
  },
  LD: {
    length: TRAIN, gaps: [5, 12, 17], doors: [2, 10, 18], lights: 0,
    nose: (j, n) => (j === 0 || j === n - 1 ? [1, 3] : null),
  },
  MD: {
    length: 15, gaps: [7], doors: [2, 10], lights: 0,
    nose: () => null,
  },
};
const shapeOf = (train: Train) => SHAPES[train.service] ?? SHAPES.AV;
// Every train stops against the buffers, so shorter ones stop lower down.
const stopOf = (train: Train) => BUMPER - shapeOf(train).length;

// Each track keeps one colour, shared by its card, its sign and the walk to it.
export const trackColors = ['#3f9b64', '#3f73c8', '#7866d0', '#cf852b'];
export const trackColor = (track: number) => trackColors[(track - 1) % trackColors.length];

const LIGHT = {
  bed: '#efede7',
  sleeper: '#e2e0d9',
  rail: '#c4c2ba',
  island: '#e8e6df',
  edge: '#dad8d0',
  tactile: '#e4d6a6',
  pillar: '#d2d0c8',
  canopy: '#d8d6ce',
  bumper: '#9a9994',
  hall: '#ecebe5',
  hallEdge: '#dcdad2',
  stairs: '#d6d4cc',
  train: '#51514e',
  vent: '#6a6a66',
  door: '#b9b8b2',
  label: '#9a9994',
  tag: '#fdfdfc',
  tagEdge: '#d6d4cc',
  tagText: '#a3a29d',
  tagBusy: '#484846',
  signalOff: '#c9c7bf',
  signalGo: '#3f9b64',
  signalStop: '#d0574a',
  held: '#e0a030',
  clock: '#111111',
  date: '#646460',
  night: 'rgba(38, 46, 72, .34)',
  lamp: '#f0c05a',
  shade: '#e1dfd8',
  steam: '#cfcdc6',
  segOff: 'rgba(0, 0, 0, .05)',
};

// The same station with the lights down, for dark mode: the ground sinks,
// trains and signage come forward.
const DARK: typeof LIGHT = {
  bed: '#1f1e1c',
  sleeper: '#282724',
  rail: '#4c4b46',
  island: '#2b2a27',
  edge: '#363531',
  tactile: '#6e613a',
  pillar: '#403f3a',
  canopy: '#3b3a36',
  bumper: '#6d6c66',
  hall: '#242321',
  hallEdge: '#31302d',
  stairs: '#3b3a36',
  train: '#8d8c86',
  vent: '#a9a8a2',
  door: '#dcdbd6',
  label: '#7a7973',
  tag: '#1b1a18',
  tagEdge: '#3d3c38',
  tagText: '#72716c',
  tagBusy: '#d4d3ce',
  signalOff: '#4c4b46',
  signalGo: '#49a46d',
  signalStop: '#d35c48',
  held: '#e8aa3a',
  clock: '#e0e0e0',
  date: '#9e9e9b',
  night: 'rgba(4, 6, 14, .5)',
  lamp: '#f0c05a',
  shade: '#272623',
  steam: '#5c5b56',
  segOff: 'rgba(255, 255, 255, .05)',
};

// Swapped at the start of each frame, so the helpers below paint with the
// palette of the current scheme.
let C = LIGHT;

const groupX = (group: number) => LEFT + group * (GROUP + GAP);
export const trackX = (track: number) => groupX(Math.floor((track - 1) / 2)) + ((track - 1) % 2 ? TRACK + ISLAND : 0);
const islandMid = (track: number) => groupX(Math.floor((track - 1) / 2)) + TRACK + ISLAND / 2;

const DOORS = [2, 10, 18];

type Point = [number, number];

// Where the platform meets the train's doors. Odd tracks run on the left of
// their island, so their doors face its left edge; even tracks, its right.
function platform(track: number) {
  const ix = groupX(Math.floor((track - 1) / 2)) + TRACK;
  const left = (track - 1) % 2 === 0;
  // `edge` is the island's border line; `stand` the first pixel inside it.
  return { edge: left ? ix : ix + ISLAND - 1, stand: left ? ix + 1 : ix + ISLAND - 2, column: islandMid(track) };
}

// The bottom rows of the concourse, under its labels, are the walkway.
const WALKWAY = HALL + HALL_H - 3;

// The route drawn for the focused train, pixel by pixel: to the middle door.
const walkPaths = new Map<number, { points: Point[]; edge: number; doorY: number }>();
function walkPath(track: number) {
  let found = walkPaths.get(track);
  if (!found) {
    const { edge, stand, column } = platform(track);
    const doorY = STOP + DOORS[1];
    const hallY = WALKWAY + 1;
    const points: Point[] = [];
    for (let x = 8; x < column; x++) points.push([x, hallY]);
    for (let y = hallY; y > doorY; y--) points.push([column, y]);
    const step = Math.sign(stand - column);
    for (let x = column; x !== stand + step; x += step) points.push([x, doorY]);
    found = { points, edge, doorY };
    walkPaths.set(track, found);
  }
  return found;
}

// Night: no trains run between about 23:40 and 05:15. The hall dims in four
// steps from 23:00, the platform lamps come on, three trains are put to bed
// on tracks 2, 5 and 7, and it all comes back at dawn.
const DUSK = [23 * 60, 23 * 60 + 45];
const DAWN = [4 * 60 + 50, 5 * 60 + 35];
const SLEEPERS = [2, 5, 7];
const PARK = [23 * 60 + 50, 5 * 60 + 5];

function nightness(minute: number) {
  const m = ((minute % 1440) + 1440) % 1440;
  const level = m >= DUSK[0] ? Math.min(1, (m - DUSK[0]) / (DUSK[1] - DUSK[0]))
    : m < DAWN[0] ? 1 : m < DAWN[1] ? 1 - (m - DAWN[0]) / (DAWN[1] - DAWN[0]) : 0;
  return Math.round(level * 4) / 4;
}

// Where a parked train sits, rolling in at bedtime and out before the first
// arrival; null while it is away.
function parkedY(minute: number) {
  const m = ((minute % 1440) + 1440) % 1440;
  const since = m >= PARK[0] ? m - PARK[0] : m < PARK[1] + LEAVE ? m + 1440 - PARK[0] : -1;
  const until = m < PARK[1] + LEAVE ? m - PARK[1] : -Infinity;
  if (since < 0) return null;
  if (since < ENTER) return OUT + (STOP - OUT) * easeOut(since / ENTER);
  if (until > 0) return STOP + (OUT - STOP) * easeIn(until / LEAVE);
  return STOP;
}

const Z = ['###', '.#.', '###'];

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t ** 3;

// Where a train's top edge is at `now`, or null when it is not in the hall.
function trainY(train: Train, now: number, still: boolean) {
  const since = now - (train.departure + ARRIVE);
  const after = now - train.departure;
  if (since < 0 || after > LEAVE) return null;
  const stop = stopOf(train);
  if (still) return after >= 0 ? null : stop;
  if (since < ENTER) return OUT + (stop - OUT) * easeOut(since / ENTER);
  if (after > 0) return stop + (OUT - stop) * easeIn(after / LEAVE);
  return stop;
}

// Which way a train is moving: 1 coming in (down), -1 leaving (up), 0 still.
function motion(train: Train, now: number) {
  if (now - (train.departure + ARRIVE) < ENTER) return 1;
  if (now > train.departure) return -1;
  return 0;
}

function drawHall(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, W, H);
  for (let group = 0; group < 4; group++) {
    const x = groupX(group);
    // Island platform: surface, edges, the yellow tactile line and pillars.
    const ix = x + TRACK;
    ctx.fillStyle = C.island;
    ctx.fillRect(ix, TOP + 1, ISLAND, BUMPER - TOP + 2);
    ctx.fillStyle = C.edge;
    ctx.fillRect(ix, TOP + 1, 1, BUMPER - TOP + 2);
    ctx.fillRect(ix + ISLAND - 1, TOP + 1, 1, BUMPER - TOP + 2);
    ctx.fillStyle = C.tactile;
    for (let y = TOP + 2; y < BUMPER + 2; y += 2) {
      ctx.fillRect(ix + 1, y, 1, 1);
      ctx.fillRect(ix + ISLAND - 2, y, 1, 1);
    }
    // The canopy's shadow: a 25% ordered dither over the platform.
    ctx.fillStyle = C.shade;
    for (let y = TOP + 2; y < BUMPER + 1; y += 2) for (let x2 = ix + 2; x2 < ix + ISLAND - 2; x2 += 2) ctx.fillRect(x2, y, 1, 1);
    ctx.fillStyle = C.pillar;
    for (let y = TOP + 6; y < BUMPER - 2; y += 8) ctx.fillRect(ix + ISLAND / 2 - 1, y, 2, 2);
    // Stairs down to the concourse.
    ctx.fillStyle = C.stairs;
    for (let y = BUMPER + 3; y < HALL; y++) if (y % 2) ctx.fillRect(ix + 3, y, ISLAND - 6, 1);
    for (const tx of [x, x + TRACK + ISLAND]) {
      ctx.fillStyle = C.bed;
      ctx.fillRect(tx, TOP + 1, TRACK, BUMPER - TOP + 1);
      ctx.fillStyle = C.sleeper;
      for (let y = TOP + 2; y < BUMPER; y += 3) ctx.fillRect(tx, y, TRACK, 1);
      ctx.fillStyle = C.rail;
      ctx.fillRect(tx + 1, TOP + 1, 1, BUMPER - TOP);
      ctx.fillRect(tx + TRACK - 2, TOP + 1, 1, BUMPER - TOP);
      ctx.fillStyle = C.bumper;
      ctx.fillRect(tx + 1, BUMPER, TRACK - 2, 2);
    }
  }
  ctx.fillStyle = C.canopy;
  ctx.fillRect(LEFT - 4, TOP, W - (LEFT - 4) * 2, 1);
  // Concourse, with the entrance on the left and the way out on the right.
  ctx.fillStyle = C.hallEdge;
  ctx.fillRect(3, HALL, W - 6, HALL_H);
  ctx.fillStyle = C.hall;
  ctx.fillRect(4, HALL + 1, W - 8, HALL_H - 2);
  drawText(ctx, '→ acceso', 7, HALL + 1, C.label);
  drawText(ctx, 'salida →', W - 7 - measure('salida →'), HALL + 1, C.label);
}

function drawTrain(ctx: CanvasRenderingContext2D, train: Train, y: number, color: string | null, doorsOpen: boolean, moving = 0) {
  const x = trackX(train.track) + 1;
  const body = color ?? C.train;
  const shape = shapeOf(train);
  const n = shape.length;
  const px = (dx: number, dy: number, w: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x + dx, y + dy, w, 1);
  };
  let car = 0;
  for (let j = 0; j < n; j++) {
    // A one-row gap with a coupler between cars.
    if (shape.gaps.includes(j)) { px(2, j, 1, body); car = 0; continue; }
    const [dx, w] = shape.nose(j, n) ?? full;
    px(dx, j, w, body);
    if (w === 5 && car % 2 === 1 && !shape.gaps.includes(j + 1)) px(2, j, 1, color ? 'rgba(255,255,255,.35)' : C.vent);
    car++;
  }
  // Flat cabs get a dark windscreen.
  if (train.service === 'MD') for (const j of [1, n - 2]) px(1, j, 3, color ? 'rgba(0,0,0,.25)' : C.vent);
  // Head and tail lights while it moves: white at the front, red behind.
  if (moving) {
    const front = moving > 0 ? n - 1 - shape.lights : shape.lights;
    const back = moving > 0 ? shape.lights : n - 1 - shape.lights;
    for (const [row, fill] of [[front, '#fff6d8'], [back, '#e0563f']] as const) {
      px(1, row, 1, fill);
      px(3, row, 1, fill);
    }
  }
  if (!doorsOpen) return;
  // Doors open on the platform side.
  const side = (train.track - 1) % 2 ? 0 : 4;
  const door = color ? '#fdfdfc' : C.door;
  for (const dy of shape.doors) {
    px(side, dy, 1, door);
    px(side, dy + 1, 1, door);
  }
}

// A few pixels of steam left behind at the buffers as a train pulls out,
// thinning in steps.
function drawSteam(ctx: CanvasRenderingContext2D, train: Train, now: number) {
  const t = (now - train.departure) / .4;
  if (t <= 0 || t >= 1) return;
  const x = trackX(train.track);
  let seed = [...train.id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const rand = () => ((seed = Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0) / 4294967296);
  ctx.fillStyle = C.steam;
  ctx.globalAlpha = Math.ceil((1 - t) * 3) / 3;
  for (let i = 0; i < 7; i++) {
    const dx = Math.round(rand() * 6 + (rand() - .5) * t * 6);
    const dy = Math.round(-rand() * 4 - t * (2 + rand() * 4));
    if (rand() > t * .8) ctx.fillRect(x + dx, BUMPER - 1 + dy, 1, 1);
  }
  ctx.globalAlpha = 1;
}

// Seven-segment digits, 5×9, with the unlit segments faintly visible like a
// real display. `scramble` shows a random digit where the time just changed.
const SEGMENTS: Record<string, [number, number, number, number][]> = {
  a: [[1, 0, 3, 1]], b: [[4, 1, 1, 3]], c: [[4, 5, 1, 3]], d: [[1, 8, 3, 1]],
  e: [[0, 5, 1, 3]], f: [[0, 1, 1, 3]], g: [[1, 4, 3, 1]],
};
const DIGITS: Record<string, string> = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

function drawSeven(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, on: string, off: string, colon: boolean) {
  for (const char of text) {
    if (char === ':') {
      ctx.fillStyle = colon ? on : off;
      ctx.fillRect(x, y + 2, 1, 1);
      ctx.fillRect(x, y + 6, 1, 1);
      x += 2;
      continue;
    }
    const lit = DIGITS[char] ?? '';
    for (const [segment, rects] of Object.entries(SEGMENTS)) {
      ctx.fillStyle = lit.includes(segment) ? on : off;
      for (const [dx, dy, w, h] of rects) ctx.fillRect(x + dx, y + dy, w, h);
    }
    x += 6;
  }
}

function drawTag(ctx: CanvasRenderingContext2D, track: number, fill: string | null, busy: boolean, dy = 0) {
  const x = trackX(track);
  const text = String(track);
  ctx.fillStyle = fill ?? C.tagEdge;
  ctx.fillRect(x + 1, 1 + dy, TRACK - 2, 9);
  ctx.fillRect(x, 2 + dy, TRACK, 7);
  if (!fill) {
    ctx.fillStyle = C.tag;
    ctx.fillRect(x + 1, 2 + dy, TRACK - 2, 7);
  }
  drawText(ctx, text, x + Math.floor((TRACK - measure(text)) / 2), 1 + dy, fill ? '#fdfdfc' : busy ? C.tagBusy : C.tagText);
}

// The walk from the entrance to the focused train, as marching pixels in the
// track's colour: along the bottom of the concourse, up the island's stairs,
// along the platform and across to the middle door, where a two-pixel mark
// on the platform edge faces it. It is the same route the passengers take.
// `drawn` (0–1) traces it out.
function drawWalk(ctx: CanvasRenderingContext2D, track: number, color: string, tick: number, drawn = 1) {
  const { points, edge, doorY } = walkPath(track);
  ctx.fillStyle = color;
  const shown = Math.floor(points.length * drawn);
  points.forEach(([x, y], index) => { if (index < shown && (((index - tick) % 4) + 4) % 4 < 2) ctx.fillRect(x, y, 1, 1); });
  if (drawn < 1) return;
  ctx.fillRect(edge, doorY, 1, 2);
}

// The opening: the hall dissolves in from the left in a dithered sweep, the
// signs drop in one by one, the trains roll up to their bumpers and the walk
// to the next train traces itself out. Times in ms since the first frame.
const INTRO = { hall: 650, clock: 260, tags: 300, trains: 520, walk: 1250 };
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function introHall(hall: HTMLCanvasElement) {
  const source = hall.getContext('2d')!.getImageData(0, 0, W, H);
  const scratch = document.createElement('canvas');
  scratch.width = W;
  scratch.height = H;
  const out = scratch.getContext('2d')!;
  const frame = out.createImageData(W, H);
  // Each pixel's turn: mostly left to right, a little bottom to top, with
  // enough noise that the edge reads as dither rather than a wipe.
  let seed = 7;
  const turn = Float32Array.from({ length: W * H }, (_, i) => {
    seed = (seed * 16807) % 2147483647;
    return (i % W) / W * .62 + (1 - Math.floor(i / W) / H) * .12 + (seed / 2147483647) * .26;
  });
  return (progress: number) => {
    for (let i = 0; i < turn.length; i++) {
      const o = i * 4;
      const on = turn[i] <= progress;
      frame.data[o] = source.data[o];
      frame.data[o + 1] = source.data[o + 1];
      frame.data[o + 2] = source.data[o + 2];
      frame.data[o + 3] = on ? source.data[o + 3] : 0;
    }
    out.putImageData(frame, 0, 0);
    return scratch;
  };
}

type Props = {
  now: () => number;
  // On wide screens the clock is drawn in the hall; narrow ones show it above.
  showClock: boolean;
  simulated: boolean;
  focus: Train | null;
  reducedMotion: boolean;
  onHover: (train: Train | null) => void;
  onPick: (train: Train) => void;
  // Called when a signal turns green, for the relay click.
  onSignal?: () => void;
  scale: number;
  dpr: number;
};

export default function StationMap({ now, showClock, simulated, focus, reducedMotion, onHover, onPick, onSignal, scale, dpr }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hall = useRef<HTMLCanvasElement | null>(null);
  const born = useRef<number | null>(null);
  const walk = useRef<{ id: string | null; since: number }>({ id: null, since: 0 });
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const present = useRef<Train[]>([]);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const clockRef = useRef({ showClock, simulated });
  clockRef.current = { showClock, simulated };
  const signalRef = useRef(onSignal);
  signalRef.current = onSignal;

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    // The hall only changes with the colour scheme: draw it once per scheme
    // and stamp it every frame.
    C = isDark() ? DARK : LIGHT;
    let hallPalette = C;
    if (!hall.current) {
      hall.current = document.createElement('canvas');
      hall.current.width = W;
      hall.current.height = H;
    }
    drawHall(hall.current.getContext('2d')!);
    const reveal = reducedMotion ? null : introHall(hall.current);
    let raf = 0;
    let lastMinute = NaN;
    let shown = { text: '', previous: '', at: -Infinity };
    let movingBefore = new Set<number>();
    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      born.current ??= reducedMotion ? -Infinity : time;
      const intro = time - born.current;
      C = isDark() ? DARK : LIGHT;
      if (hallPalette !== C) {
        hallPalette = C;
        drawHall(hall.current!.getContext('2d')!);
      }
      const minute = now();
      const focused = focusRef.current;
      // The canvas holds one texel per device pixel. The art is still laid
      // out on the coarse grid, but moving things are placed to the nearest
      // device pixel, so they glide instead of hopping a whole grid cell.
      const k = scaleRef.current;
      const snap = (value: number) => Math.round(value * k) / k;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(reveal && intro < INTRO.hall ? reveal(intro / INTRO.hall) : hall.current!, 0, 0, W, H);
      // Night falls over the hall and whatever is parked in it; the lamps,
      // signage and anything moving stay bright on top.
      const night = reducedMotion ? nightness(minute) : nightness(minute) * clamp01((intro - INTRO.hall) / 300);
      const parked = parkedY(minute);
      if (parked !== null) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, TOP + 1, W, BUMPER - TOP - 1);
        ctx.clip();
        for (const track of SLEEPERS) drawTrain(ctx, { track, service: 'AV' } as Train, snap(parked), null, false);
        ctx.restore();
      }
      if (night > 0) {
        // `source-atop` darkens only what is drawn, not the empty canvas.
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = night;
        ctx.fillStyle = C.night;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        // Platform lamps: a warm pixel pair with a faint cross of light.
        for (let group = 0; group < 4; group++) {
          const x = groupX(group) + TRACK + ISLAND / 2 - 1;
          for (let y = TOP + 6; y < BUMPER - 2; y += 8) {
            ctx.fillStyle = C.lamp;
            ctx.globalAlpha = night * .28;
            ctx.fillRect(x - 1, y, 4, 2);
            ctx.fillRect(x, y - 1, 2, 4);
            ctx.globalAlpha = night;
            ctx.fillRect(x, y, 2, 2);
          }
        }
        ctx.globalAlpha = 1;
        // Sleeping trains breathe out little z's.
        if (parked === STOP && !reducedMotion) {
          ctx.fillStyle = C.label;
          SLEEPERS.forEach((track, i) => {
            const t = ((time / 2600 + i * .37) % 1);
            const zy = snap(STOP - 1 - t * 5);
            ctx.globalAlpha = night * (t < .7 ? 1 : (1 - t) / .3);
            Z.forEach((row, j) => [...row].forEach((cell, k) => { if (cell === '#') ctx.fillRect(trackX(track) + 4 + k, zy + j - 3, 1, 1); }));
          });
          ctx.globalAlpha = 1;
        }
      }
      // With nothing running, the concourse says when the first train is.
      if (night === 1) {
        const first = upcoming(minute, 1)[0];
        if (first) {
          const note = `sin servicio · primer tren ${clock(first.scheduled)}`;
          drawText(ctx, note, Math.round((W - measure(note)) / 2), HALL + 1, C.date);
        }
      }
      // The clock blinks on, like a display powering up.
      const clockOn = intro > INTRO.clock + 160 || (intro > INTRO.clock && Math.floor(intro / 55) % 2 === 0);
      if (clockRef.current.showClock && clockOn) {
        const text = clock(minute);
        if (text !== shown.text) shown = { text, previous: shown.text, at: time };
        const scrambling = !reducedMotion && time - shown.at < 140 && shown.previous;
        const face = scrambling
          ? [...text].map((char, i) => (char !== shown.previous[i] && char !== ':' ? String(Math.floor(Math.random() * 10)) : char)).join('')
          : text;
        drawSeven(ctx, face, 5, TOP + 1, C.clock, C.segOff, reducedMotion || Math.floor(time / 500) % 2 === 0);
        drawText(ctx, clockRef.current.simulated ? 'simulada' : 'ahora', 5, TOP + 11, C.label);
        const [weekday, ...date] = dateLabel(minute).split(' ');
        drawText(ctx, weekday, W - 5 - measure(weekday), TOP + 1, C.date);
        drawText(ctx, date.join(' '), W - 5 - measure(date.join(' ')), TOP + 10, C.label);
      }
      const trains = around(minute).filter(train => minute >= train.departure + ARRIVE && minute <= train.departure + LEAVE);
      present.current = trains;
      const busy = new Set<number>();
      const boarding = new Set<number>();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, TOP + 1, W, BUMPER - TOP - 1);
      ctx.clip();
      trains.sort((a, b) => a.track - b.track).forEach((train, index) => {
        let y = trainY(train, minute, reducedMotion);
        if (y === null) return;
        const arrive = clamp01((intro - INTRO.trains - index * 80) / 650);
        if (arrive <= 0) return;
        y = snap(OUT + (y - OUT) * easeOut(arrive));
        busy.add(train.track);
        const t = minute - train.departure;
        const isBoarding = t >= BOARD && t < 0;
        if (isBoarding) boarding.add(train.track);
        drawTrain(ctx, train, y, train.id === focused?.id ? trackColor(train.track) : null, isBoarding, reducedMotion ? 0 : motion(train, minute));
      });
      for (const train of trains) if (!reducedMotion) drawSteam(ctx, train, minute);
      ctx.restore();
      // Signals: green while a train is moving in or out.
      const moving = new Set<number>();
      for (const train of trains) {
        if (!busy.has(train.track)) continue;
        const go = (minute - (train.departure + ARRIVE) < ENTER) || minute - train.departure > -.5;
        if (go) moving.add(train.track);
        ctx.fillStyle = go ? C.signalGo : C.signalOff;
        ctx.fillRect(trackX(train.track) + 3, TOP - 1, 1, 1);
      }
      // A late train is held outside: its headlights blink amber at the
      // mouth of the track and the signal stays red until it is let in.
      for (const train of around(minute)) {
        if (!train.delay || minute < train.scheduled + ARRIVE || minute >= train.departure + ARRIVE) continue;
        const x = trackX(train.track);
        ctx.fillStyle = C.signalStop;
        ctx.fillRect(x + 3, TOP - 1, 1, 1);
        if (reducedMotion || Math.floor(time / 420) % 2 === 0) {
          ctx.fillStyle = C.held;
          ctx.fillRect(x + 2, TOP + 1, 1, 1);
          ctx.fillRect(x + 4, TOP + 1, 1, 1);
        }
      }
      // Relay click as a signal turns green; not when jumping through time.
      const steady = Math.abs(minute - lastMinute) < 1 && intro > INTRO.trains + 700;
      if (steady) for (const track of moving) if (!movingBefore.has(track)) signalRef.current?.();
      movingBefore = moving;
      lastMinute = minute;
      for (let track = 1; track <= TRACKS; track++) {
        const drop = clamp01((intro - INTRO.tags - track * 45) / 200);
        if (drop <= 0) continue;
        const lit = boarding.has(track) || (focused?.track === track && minute >= focused.departure + ANNOUNCE);
        drawTag(ctx, track, lit ? trackColor(track) : null, busy.has(track), snap(-4 * (1 - easeOut(drop))));
      }
      // The walk traces itself out on arrival and whenever the focus moves
      // to another train.
      const focusId = focused?.id ?? null;
      if (walk.current.id !== focusId) walk.current = { id: focusId, since: time };
      const introWalk = born.current + INTRO.walk;
      const traced = reducedMotion ? 1 : walk.current.since > introWalk
        ? clamp01((time - walk.current.since) / 320)
        : clamp01((time - introWalk) / 550);
      if (focused && traced > 0 && minute >= focused.departure + ANNOUNCE && minute < focused.departure) {
        drawWalk(ctx, focused.track, trackColor(focused.track), reducedMotion ? 0 : Math.floor(time / 70), easeOut(traced));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [now, reducedMotion]);

  const trainAt = (event: MouseEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width * W;
    const y = (event.clientY - box.top) / box.height * H;
    if (y > BUMPER + 2) return null;
    const track = Array.from({ length: TRACKS }, (_, i) => i + 1).find(t => x >= trackX(t) - 1 && x < trackX(t) + TRACK + 1);
    return present.current.find(train => train.track === track && now() < train.departure) ?? null;
  };

  return (
    <canvas
      ref={canvas}
      className="trenes-map"
      width={W * scale}
      height={H * scale}
      style={{ width: W * scale / dpr, height: H * scale / dpr }}
      onPointerMove={event => {
        const train = trainAt(event);
        if (train) event.currentTarget.dataset.pointing = '';
        else delete event.currentTarget.dataset.pointing;
        onHover(train);
      }}
      onPointerLeave={() => onHover(null)}
      onClick={event => { const train = trainAt(event); if (train) onPick(train); }}
      role="img"
      aria-label={focus ? `Plano de la estación. El tren a ${focus.destination} sale de la vía ${focus.track}.` : 'Plano de la estación con ocho vías.'}
    />
  );
}

// Largest whole number of device pixels per grid pixel that fits the box.
export function useCrispScale(box: RefObject<HTMLElement | null>, width: number) {
  const [state, setState] = useState({ scale: 3, dpr: 1 });
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => {
      const dpr = devicePixelRatio || 1;
      const scale = Math.max(1, Math.floor(element.clientWidth * dpr / width));
      setState(current => current.scale === scale && current.dpr === dpr ? current : { scale, dpr });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [box, width]);
  return state;
}
