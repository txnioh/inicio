// Every scene is a grid of characters, like a text editor: things move a
// whole cell at a time. Scenery fills cells; critters are sprites, rows of
// text drawn at their natural width but placed on the grid, so they still
// move a cell at a time. The same grid is drawn as Geist text or in a pixel
// font, so both versions show the same characters.

export const COLS = 32;
export const ROWS = 16;

export const C = {
  green: '#54CA31',
  greenDark: '#2F7A1C',
  greenDeep: '#1B4A10',
  blue: '#328FF2',
  blueDark: '#1D5BA0',
  blueDeep: '#123A66',
  orange: '#FF7B00',
  orangeDark: '#A34E00',
  white: '#FFFFFF',
  grey: '#9A9A96',
  greyDark: '#4A4A47',
  yellow: '#FFD34D',
  sand: '#D9B77A',
  sandDark: '#7A6440',
};

/** Quarter turns clockwise, for glyphs that follow a direction. */
export type Turn = 0 | 1 | 2 | 3;
export type Cell = { ch: string; color: string; turn: Turn };
/** A critter: rows centred on column cx, the first row at `top`. */
export type Sprite = { cx: number; top: number; rows: readonly string[]; color: string };

// Slithy moves on its own square lattice, 8 × 8 pixels of the pixel
// version, so its segments are as wide as they are tall.
export const LATTICE = 8;
export type Snake = { body: { x: number; y: number }[]; apples: { x: number; y: number }[]; tongue: boolean };

export class Grid {
  cells: (Cell | null)[] = new Array(COLS * ROWS).fill(null);
  sprites: Sprite[] = [];
  snake: Snake | null = null;

  clear() { this.cells.fill(null); this.sprites = []; this.snake = null; }

  /** One character; spaces leave what is underneath. */
  set(x: number, y: number, ch: string, color: string, turn: Turn = 0) {
    x = Math.round(x); y = Math.round(y);
    if (ch === ' ' || x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    this.cells[y * COLS + x] = { ch, color, turn };
  }

  /** A string along a row, starting at x. */
  text(x: number, y: number, str: string, color: string) {
    Array.from(str).forEach((ch, i) => this.set(x + i, y, ch, color));
  }

  /**
   * Rows of a critter, each centred on column cx, the first row at y. The
   * critter is solid: scenery doesn't show through it.
   */
  art(cx: number, y: number, rows: readonly string[], color: string) {
    rows.forEach((row, j) => {
      const chars = Array.from(row.trim());
      const x0 = Math.floor(cx - chars.length * .45), x1 = Math.ceil(cx + chars.length * .45);
      if (chars.length) for (let x = x0; x <= x1; x++) this.erase(x, y + j);
    });
    this.sprites.push({ cx, top: y, rows, color });
  }

  /** A critter standing with its last row on `ground`, raised by `lift` rows. */
  stand(cx: number, ground: number, rows: readonly string[], color: string, lift = 0) {
    this.art(cx, ground - rows.length + 1 - lift, rows, color);
  }

  erase(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) this.cells[y * COLS + x] = null;
  }

  get(x: number, y: number) { return this.cells[y * COLS + x]; }
}

export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const inside = (t: number, a: number, b: number) => t >= a && t < b;
/** Progress of t through [a, b], 0 before and 1 after. */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
/** Whole steps of `every` seconds since 0. */
export const tick = (t: number, every: number) => Math.floor(t / every);
/**
 * Steps of a timeline, each [value, seconds]. Returns the value for time
 * t, and t's progress through that step.
 */
export function play<T>(t: number, steps: readonly (readonly [T, number])[]): { value: T; p: number } {
  let at = 0;
  for (const [value, length] of steps) {
    if (t < at + length) return { value, p: (t - at) / length };
    at += length;
  }
  return { value: steps[steps.length - 1][0], p: 1 };
}
export const total = (steps: readonly (readonly [unknown, number])[]) => steps.reduce((sum, [, length]) => sum + length, 0);

/** Stable pseudo-random numbers in [0, 1) for scenery. */
export const rand = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Twinkling stars: each cell shows · + or * in turn, or nothing. */
export function stars(g: Grid, t: number, count: number, seed: number, rows: number, avoid?: (x: number, y: number) => boolean) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand(seed + i) * COLS), y = Math.floor(rand(seed + i + 50) * rows);
    if (avoid?.(x, y)) continue;
    const phase = (tick(t, .35) + Math.floor(rand(seed + i + 90) * 12)) % 12;
    const ch = phase < 5 ? '·' : phase < 7 ? '+' : phase === 7 ? '*' : phase < 10 ? '·' : '';
    if (ch) g.set(x, y, ch, phase === 7 ? C.white : phase >= 5 && phase < 7 ? C.white : C.grey);
  }
}
