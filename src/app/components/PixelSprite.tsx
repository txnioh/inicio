import { layout } from '../trenes/pixelType';

// Tiny pixel-art pieces for the wardrobe, drawn as SVG squares so they stay
// crisp and take their colour from CSS.
const paths = new Map<string, string>();

function path(rows: readonly string[]) {
  const key = rows.join('/');
  let d = paths.get(key);
  if (d === undefined) {
    d = rows.flatMap((row, y) => [...row].map((cell, x) => cell === '#' ? `M${x} ${y}h1v1h-1z` : '')).join('');
    paths.set(key, d);
  }
  return d;
}

export function PixelSprite({ rows, unit = 2, className }: { rows: readonly string[]; unit?: number; className?: string }) {
  const width = Math.max(...rows.map(row => row.length));
  return (
    <svg className={className} width={width * unit} height={rows.length * unit} viewBox={`0 0 ${width} ${rows.length}`}
      shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      <path d={path(rows)} />
    </svg>
  );
}

export const HANGER = [
  '.......##......',
  '......#..#.....',
  '.........#.....',
  '........#......',
  '.......#.......',
  '.....##.##.....',
  '...##.....##...',
  '.##.........##.',
  '###############',
] as const;

// A luggage-style tag: pixel text in a box with clipped corners. `dotted`
// draws every other border pixel, for the empty hanger's "wearing".
export function PixelTag({ text, dotted = false, unit = 2, className }: { text: string; dotted?: boolean; unit?: number; className?: string }) {
  const { width: textWidth, paths: [text_d] } = layout(text.toLocaleLowerCase());
  const w = textWidth + 6;
  const h = 10;
  let border = '';
  for (let x = 1; x < w - 1; x++) {
    if (dotted && x % 2) continue;
    border += `M${x} 0h1v1h-1zM${x} ${h - 1}h1v1h-1z`;
  }
  for (let y = 1; y < h - 1; y++) {
    if (dotted && y % 2) continue;
    border += `M0 ${y}h1v1h-1zM${w - 1} ${y}h1v1h-1z`;
  }
  return (
    <svg className={className} width={w * unit} height={h * unit} viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      <path className="pixel-tag-border" d={border} />
      <path d={text_d} transform="translate(3 0)" />
    </svg>
  );
}
