import { glyph as robotGlyph, GLYPH_HEIGHT, type Glyph } from '../robot/pixelFont';

// The robot's lowercase font, plus capitals and a few signs for the board.
// Capitals sit on rows 2–6, the same cap height as the robot's digits, so
// mixed case lines up on one baseline.
const caps: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '·': ['', '', '#', '', ''],
  '+': ['', '.#.', '###', '.#.', ''],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '→': ['..#..', '...#.', '#####', '...#.', '..#..'],
  '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  '×': ['', '#.#', '.#.', '#.#', ''],
  // A walker, for time on foot.
  '¤': ['.#.', '###', '.#.', '#.#', '#.#'],
};

const capAccents: Record<string, [string, string[]]> = {
  Á: ['A', ['..#', '.#.']], É: ['E', ['..#', '.#.']], Í: ['I', ['..#', '.#.']], Ó: ['O', ['..#', '.#.']], Ú: ['U', ['..#', '.#.']], Ñ: ['N', ['', '####']],
};

const glyphs = new Map<string, Glyph>();
for (const [char, rows] of Object.entries(caps)) glyphs.set(char, { width: Math.max(...rows.map(row => row.length)), rows: ['', '', ...rows] });
for (const [char, [letter, accent]] of Object.entries(capAccents)) {
  const base = glyphs.get(letter)!;
  glyphs.set(char, { width: base.width, rows: [...accent, ...base.rows.slice(2)] });
}

// Big digits for clock times and platform numbers: 5×7, a hair rounder than
// the small ones so they read at a glance from across the page.
const bigRows: Record<string, string[]> = {
  0: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  1: ['.##', '###', '.##', '.##', '.##', '.##', '.##'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.', '#', '.', '.', '.', '#', '.'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  ' ': ['..'],
};
const big = new Map<string, Glyph>(Object.entries(bigRows).map(([char, rows]) => [char, { width: Math.max(...rows.map(row => row.length)), rows }]));

export type Font = 'small' | 'big';
export const FONT_HEIGHT: Record<Font, number> = { small: GLYPH_HEIGHT, big: 7 };

export function glyph(char: string, font: Font = 'small'): Glyph {
  if (font === 'big') return big.get(char) ?? big.get('-')!;
  return glyphs.get(char) ?? robotGlyph(char);
}

export function measure(text: string, font: Font = 'small') {
  return [...text].reduce((width, char, index) => width + glyph(char, font).width + (index ? 1 : 0), 0);
}

type Layout = { width: number; height: number; paths: string[] };
const layouts = new Map<string, Layout>();

// One SVG path per text, a unit square per pixel. `buckets` splits the pixels
// into interleaved groups, so they can dissolve in one after another.
export function layout(text: string, font: Font = 'small', buckets = 1): Layout {
  const key = `${font}${buckets}${text}`;
  const cached = layouts.get(key);
  if (cached) return cached;
  const parts = Array.from({ length: buckets }, () => [] as string[]);
  let x = 0;
  [...text].forEach(char => {
    const { width, rows } = glyph(char, font);
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== '#') continue;
        const px = x + i;
        parts[(Math.imul(px + 1, 0x9e3779b1) ^ Math.imul(j + 1, 0x85ebca6b)) >>> 29 & (buckets - 1)].push(`M${px} ${j}h1v1h-1z`);
      }
    });
    x += width + 1;
  });
  const result = { width: Math.max(0, x - 1), height: FONT_HEIGHT[font], paths: parts.map(part => part.join('')) };
  layouts.set(key, result);
  return result;
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, font: Font = 'small') {
  ctx.fillStyle = color;
  [...text].forEach(char => {
    const { width, rows } = glyph(char, font);
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i, y + j, 1, 1);
    });
    x += width + 1;
  });
}
