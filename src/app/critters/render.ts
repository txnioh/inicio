import { bitmap, CELL_H, CELL_W, pixels, SNAKE_PARTS } from './font';
import { C, COLS, type Grid, LATTICE, ROWS, type Snake, type Sprite } from './grid';

export const PIXEL_W = COLS * CELL_W;
export const PIXEL_H = ROWS * CELL_H;

type Ctx = CanvasRenderingContext2D;
type Dir = { x: number; y: number };
/** Quarter turns that point something drawn facing up along d. */
const turnOf = (d: Dir) => (d.y < 0 ? 0 : d.x > 0 ? 1 : d.y > 0 ? 2 : 3);

// Geist lacks a few glyphs: ◎ is an o in a ring, ⹁ and ɔ are a comma and a
// c flipped, and ↦ ↤ are arrows with a bar added.
const MIRRORED: Record<string, string> = { '⹁': ',', 'ɔ': 'c' };
const BARRED: Record<string, [string, number]> = { '↦': ['→', -1], '↤': ['←', 1] };

function glyphWidth(ctx: Ctx, ch: string, size: number) {
  if (ch === '◎') return size * .9;
  return ctx.measureText(MIRRORED[ch] ?? BARRED[ch]?.[0] ?? ch).width;
}

/** One character in Geist, centred on (x, y). */
function glyph(ctx: Ctx, ch: string, x: number, y: number, size: number, turn = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn * Math.PI / 2);
  if (ch === '◎') {
    ctx.lineWidth = size * .08;
    ctx.beginPath();
    ctx.arc(0, 0, size * .38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `500 ${size * .7}px Geist, sans-serif`;
    ctx.fillText('o', 0, size * .02);
  } else if (BARRED[ch]) {
    const [arrow, side] = BARRED[ch];
    ctx.fillText(arrow, 0, 0);
    ctx.lineWidth = size * .07;
    ctx.beginPath();
    ctx.moveTo(side * size * .4, -size * .22);
    ctx.lineTo(side * size * .4, size * .22);
    ctx.stroke();
  } else if (MIRRORED[ch]) {
    ctx.scale(-1, 1);
    ctx.fillText(MIRRORED[ch], 0, 0);
  } else {
    ctx.fillText(ch, 0, 0);
  }
  ctx.restore();
}

/** A sprite's rows at their natural width, each centred on the sprite. */
function spriteText(ctx: Ctx, s: Sprite, cw: number, rh: number, size: number) {
  ctx.fillStyle = s.color;
  ctx.strokeStyle = s.color;
  const cx = (s.cx + .5) * cw;
  s.rows.forEach((row, j) => {
    const chars = Array.from(row);
    const widths = chars.map(ch => glyphWidth(ctx, ch, size));
    let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
    const y = (s.top + j + .5) * rh;
    chars.forEach((ch, i) => {
      if (ch !== ' ') glyph(ctx, ch, x + widths[i] / 2, y, size);
      x += widths[i];
    });
  });
}

/**
 * Slithy as at the start: every part drawn facing up and turned the way the
 * snake runs. Segments are § between two rails, corners bend both rails,
 * the head is ‹°› with a flicking Y, the tail an arrow from a bar.
 */
function snakeText(ctx: Ctx, snake: Snake, s: number) {
  const h = s / 2, side = s * .36;
  ctx.fillStyle = C.orange;
  snake.apples.forEach(a => glyph(ctx, '●', (a.x + .5) * s, (a.y + .5) * s, s * .7));
  ctx.fillStyle = C.green;
  ctx.strokeStyle = C.green;
  ctx.lineWidth = Math.max(1.5, s * .07);
  ctx.lineCap = 'round';
  const { body } = snake;
  body.forEach((c, i) => {
    const cx = (c.x + .5) * s, cy = (c.y + .5) * s;
    const toHead = i > 0 ? { x: body[i - 1].x - c.x, y: body[i - 1].y - c.y } : null;
    const toTail = i < body.length - 1 ? { x: body[i + 1].x - c.x, y: body[i + 1].y - c.y } : null;
    const upright = (d: Dir, draw: () => void) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(turnOf(d) * Math.PI / 2); draw(); ctx.restore();
    };
    const font = (k: number) => { ctx.font = `500 ${s * k}px Geist, sans-serif`; };
    if (!toHead) {
      upright({ x: -toTail!.x, y: -toTail!.y }, () => {
        font(.72); ctx.fillText('‹°›', 0, 0);
        if (snake.tongue) { font(.62); ctx.fillText('Y', 0, -s * .92); }
      });
      return;
    }
    if (!toTail) {
      upright(toHead, () => {
        ctx.beginPath(); ctx.moveTo(-side * .6, -h * .55); ctx.lineTo(side * .6, -h * .55); ctx.stroke();
        font(.72); ctx.fillText('↓', 0, s * .08);
      });
      return;
    }
    if (toHead.x === -toTail.x && toHead.y === -toTail.y) {
      upright(toHead, () => {
        for (const x of [-side, side]) { ctx.beginPath(); ctx.moveTo(x, -h * .82); ctx.lineTo(x, h * .82); ctx.stroke(); }
        font(.6); ctx.fillText('§', 0, 0);
      });
      return;
    }
    // Corner: both rails bend around the cell corner between the open sides.
    const ox = cx + (toHead.x + toTail.x) * h, oy = cy + (toHead.y + toTail.y) * h;
    const start = Math.atan2(-toTail.y, -toTail.x), end = Math.atan2(-toHead.y, -toHead.x);
    let turn = end - start;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    for (const r of [h - side, h + side]) { ctx.beginPath(); ctx.arc(ox, oy, r, start, end, turn < 0); ctx.stroke(); }
    ctx.beginPath();
    ctx.arc(ox - (toHead.x + toTail.x) * h * .95, oy - (toHead.y + toTail.y) * h * .95, ctx.lineWidth * .7, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function drawText(ctx: Ctx, g: Grid, w: number, h: number) {
  const cw = w / COLS, rh = h / ROWS;
  // Letters sit close together, as in the film: about 0.65 em a cell.
  const size = Math.min(cw * 1.55, rh * .95);
  ctx.font = `500 ${size}px Geist, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const cell = g.get(x, y);
    if (!cell) continue;
    ctx.fillStyle = cell.color;
    ctx.strokeStyle = cell.color;
    glyph(ctx, cell.ch, (x + .5) * cw, (y + .5) * rh, size, cell.turn);
  }
  if (g.snake) snakeText(ctx, g.snake, LATTICE * w / PIXEL_W);
  ctx.font = `500 ${size}px Geist, sans-serif`;
  g.sprites.forEach(s => spriteText(ctx, s, cw, rh, size));
}

// ── Pixels ───────────────────────────────────────────────────────────

/** A sprite's rows in the pixel font, each glyph as wide as it is. */
function spritePixels(ctx: Ctx, s: Sprite) {
  ctx.fillStyle = s.color;
  const cx = s.cx * CELL_W + CELL_W / 2;
  s.rows.forEach((row, j) => {
    const chars = Array.from(row);
    const widths = chars.map(ch => (ch === ' ' ? 3 : Math.max(...bitmap(ch).map(r => r.length)) + 1));
    let x = Math.round(cx - (widths.reduce((a, b) => a + b, 0) - 1) / 2);
    const top = (s.top + j) * CELL_H + 1;
    chars.forEach((ch, i) => {
      if (ch !== ' ') bitmap(ch).forEach((r, y) => Array.from(r).forEach((p, px) => { if (p === '#') ctx.fillRect(x + px, top + y, 1, 1); }));
      x += widths[i];
    });
  });
}

/** An 8 × 8 part, turned by quarter turns. */
function part(ctx: Ctx, rows: readonly string[], x0: number, y0: number, turn: number) {
  rows.forEach((row, y) => Array.from(row).forEach((p, x) => {
    if (p !== '#') return;
    const [rx, ry] = turn === 0 ? [x, y] : turn === 1 ? [7 - y, x] : turn === 2 ? [7 - x, 7 - y] : [y, 7 - x];
    ctx.fillRect(x0 + rx, y0 + ry, 1, 1);
  }));
}

function snakePixels(ctx: Ctx, snake: Snake) {
  ctx.fillStyle = C.orange;
  snake.apples.forEach(a => part(ctx, SNAKE_PARTS.apple, a.x * LATTICE, a.y * LATTICE, 0));
  ctx.fillStyle = C.green;
  const { body } = snake;
  body.forEach((c, i) => {
    const x0 = c.x * LATTICE, y0 = c.y * LATTICE;
    const toHead = i > 0 ? { x: body[i - 1].x - c.x, y: body[i - 1].y - c.y } : null;
    const toTail = i < body.length - 1 ? { x: body[i + 1].x - c.x, y: body[i + 1].y - c.y } : null;
    if (!toHead) {
      const d = { x: -toTail!.x, y: -toTail!.y };
      part(ctx, SNAKE_PARTS.head, x0, y0, turnOf(d));
      if (snake.tongue) part(ctx, SNAKE_PARTS.tongue, x0 + d.x * LATTICE, y0 + d.y * LATTICE, turnOf(d));
      return;
    }
    if (!toTail) { part(ctx, SNAKE_PARTS.tail, x0, y0, turnOf(toHead)); return; }
    if (toHead.x === -toTail.x && toHead.y === -toTail.y) { part(ctx, SNAKE_PARTS.segment, x0, y0, toHead.x ? 1 : 0); return; }
    // The corner part joins right and down; turn it to the open sides.
    const right = toHead.x > 0 || toTail.x > 0, down = toHead.y > 0 || toTail.y > 0;
    part(ctx, SNAKE_PARTS.corner, x0, y0, right ? (down ? 0 : 3) : (down ? 1 : 2));
  });
}

export function drawPixels(ctx: Ctx, g: Grid) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const cell = g.get(x, y);
    if (!cell) continue;
    ctx.fillStyle = cell.color;
    for (const [px, py] of pixels(cell.ch, cell.turn)) ctx.fillRect(x * CELL_W + px, y * CELL_H + py, 1, 1);
  }
  if (g.snake) snakePixels(ctx, g.snake);
  g.sprites.forEach(s => spritePixels(ctx, s));
}
