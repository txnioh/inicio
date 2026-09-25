// A tiny lowercase pixel font for the robot's speech bubble. Each glyph lists
// rows 2–7 of an 8-row cell: row 2 holds ascenders, rows 3–6 the x-height and
// row 7 descenders. Rows 0–1 are left free for accents, added below.
const base: Record<string, string[]> = {
  a: ['', '.##', '#.#', '#.#', '.##'],
  b: ['#..', '##.', '#.#', '#.#', '##.'],
  c: ['', '.##', '#..', '#..', '.##'],
  d: ['..#', '.##', '#.#', '#.#', '.##'],
  e: ['', '.#.', '###', '#..', '.##'],
  f: ['.##', '#..', '##.', '#..', '#..'],
  g: ['', '.##', '#.#', '#.#', '.##', '##.'],
  h: ['#..', '##.', '#.#', '#.#', '#.#'],
  ı: ['', '#', '#', '#', '#'],
  j: ['', '.#', '.#', '.#', '.#', '#.'],
  k: ['#..', '#.#', '##.', '#.#', '#.#'],
  l: ['#.', '#.', '#.', '#.', '.#'],
  m: ['', '##.#.', '#.#.#', '#.#.#', '#.#.#'],
  n: ['', '##.', '#.#', '#.#', '#.#'],
  o: ['', '.#.', '#.#', '#.#', '.#.'],
  p: ['', '##.', '#.#', '#.#', '##.', '#..'],
  q: ['', '.##', '#.#', '#.#', '.##', '..#'],
  r: ['', '#.#', '##.', '#..', '#..'],
  s: ['', '.##', '#..', '..#', '##.'],
  t: ['.#.', '###', '.#.', '.#.', '..#'],
  u: ['', '#.#', '#.#', '#.#', '.##'],
  v: ['', '#.#', '#.#', '#.#', '.#.'],
  w: ['', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['', '#.#', '.#.', '.#.', '#.#'],
  y: ['', '#.#', '#.#', '#.#', '.##', '##.'],
  z: ['', '###', '..#', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  '.': ['', '', '', '', '#'],
  ',': ['', '', '', '', '#', '#'],
  ':': ['', '#', '', '#', ''],
  '!': ['#', '#', '#', '', '#'],
  '¡': ['', '#', '', '#', '#', '#'],
  '?': ['##.', '..#', '.#.', '', '.#.'],
  '¿': ['', '.#.', '', '.#.', '#..', '.##'],
  '-': ['', '', '##', '', ''],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '…': ['', '', '', '', '#.#.#'],
  ' ': ['..'],
};

const acute = ['..#', '.#.'];
const accented: Record<string, [string, string[]]> = {
  á: ['a', acute], é: ['e', acute], ó: ['o', acute], ú: ['u', acute], i: ['ı', ['', '#']], í: ['ı', ['.#', '#.']], ñ: ['n', ['', '###']],
};

export const GLYPH_HEIGHT = 8;
export type Glyph = { width: number; rows: string[] };

const glyphs = new Map<string, Glyph>();
for (const [char, rows] of Object.entries(base)) glyphs.set(char, { width: Math.max(...rows.map(row => row.length)), rows: ['', '', ...rows] });
for (const [char, [letter, accent]] of Object.entries(accented)) {
  const glyph = glyphs.get(letter)!;
  glyphs.set(char, { width: Math.max(glyph.width, accent[0].length), rows: [...accent, ...glyph.rows.slice(2)] });
}

export function glyph(char: string): Glyph {
  return glyphs.get(char.toLocaleLowerCase()) ?? glyphs.get('?')!;
}

export function textWidth(text: string) {
  return [...text].reduce((width, char, index) => width + glyph(char).width + (index ? 1 : 0), 0);
}

export function wrap(text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const line = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && textWidth(line) <= maxWidth) lines[lines.length - 1] = line;
    else lines.push(word);
  }
  return lines;
}

// Draws `count` characters of the text (for a typewriter reveal) at x, y.
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, count = Infinity) {
  ctx.fillStyle = color;
  [...text].slice(0, count).forEach(char => {
    const { width, rows } = glyph(char);
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i, y + j, 1, 1);
    });
    x += width + 1;
  });
}

export type BubbleLayout = { lines: string[]; w: number; h: number };

export function layoutBubble(text: string, maxWidth: number): BubbleLayout {
  const lines = wrap(text, maxWidth - 8);
  const inner = Math.max(...lines.map(textWidth));
  return { lines, w: inner + 8 + (inner % 2), h: lines.length * (GLYPH_HEIGHT + 1) + 3 };
}

// The bubble body, like the footer robot's: white, a hairline border and
// rounded corners. `count` characters of the text are shown.
export function drawBubbleBox(ctx: CanvasRenderingContext2D, { lines, w, h }: BubbleLayout, x: number, y: number, count: number) {
  ctx.fillStyle = BUBBLE_BORDER;
  ctx.fillRect(x + 2, y, w - 4, h);
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillRect(x, y + 2, w, h - 4);
  ctx.fillStyle = BUBBLE_FILL;
  ctx.fillRect(x + 2, y + 1, w - 4, h - 2);
  ctx.fillRect(x + 1, y + 2, w - 2, h - 4);
  let left = count;
  lines.forEach((line, index) => {
    drawText(ctx, line, x + Math.floor((w - textWidth(line)) / 2), y + 1 + index * (GLYPH_HEIGHT + 1), '#666666', left);
    left -= line.length + 1;
  });
}

const BUBBLE_BORDER = '#dfdfda';
const BUBBLE_FILL = '#fdfdfc';

// A bubble with its tail pointing down, at the bottom of a width×height canvas.
export function drawBubble(ctx: CanvasRenderingContext2D, text: string, count: number, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  const layout = layoutBubble(text, width - 2);
  const x = Math.round((width - layout.w) / 2);
  const y = height - layout.h - 3;
  drawBubbleBox(ctx, layout, x, y, count);
  const cx = x + layout.w / 2;
  const bottom = y + layout.h;
  ctx.fillStyle = BUBBLE_FILL;
  ctx.fillRect(cx - 2, bottom - 1, 4, 1);
  ctx.fillRect(cx - 1, bottom, 2, 1);
  ctx.fillStyle = BUBBLE_BORDER;
  ctx.fillRect(cx - 3, bottom - 1, 1, 1);
  ctx.fillRect(cx + 2, bottom - 1, 1, 1);
  ctx.fillRect(cx - 2, bottom, 1, 1);
  ctx.fillRect(cx + 1, bottom, 1, 1);
  ctx.fillRect(cx - 1, bottom + 1, 2, 1);
}
