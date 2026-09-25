// Tiny pixel-art pieces for the wardrobe, drawn as SVG squares so they stay
// crisp and take their colour from CSS.
const paths = new Map<string, string>();

function path(rows: readonly string[], ink: string) {
  const key = `${ink}:${rows.join('/')}`;
  let d = paths.get(key);
  if (d === undefined) {
    d = rows.flatMap((row, y) => [...row].map((cell, x) => cell === ink ? `M${x} ${y}h1v1h-1z` : '')).join('');
    paths.set(key, d);
  }
  return d;
}

// `#` takes the CSS colour; any other letter in `palette` gets its own.
export function PixelSprite({ rows, unit = 2, className, palette }: {
  rows: readonly string[]; unit?: number; className?: string; palette?: Record<string, string>;
}) {
  const width = Math.max(...rows.map(row => row.length));
  return (
    <svg className={className} width={width * unit} height={rows.length * unit} viewBox={`0 0 ${width} ${rows.length}`}
      shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      <path d={path(rows, '#')} />
      {palette && Object.entries(palette).map(([ink, color]) => <path key={ink} d={path(rows, ink)} fill={color} />)}
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

// A short wall rail with plus-shaped end stops; the hanger's hook wraps its
// middle row.
export const RAIL = [
  '.#...............#.',
  '###################',
  '.#...............#.',
] as const;

// The pixel look in miniature: the footer robot's 14×8 body, pixel for pixel.
export const PIXEL_LOOK = [
  '..dddddddddd..',
  '.dhhddddddddd.',
  'ddddeeddeedddd',
  'ddddeeddeedddd',
  'ddddeeddeedddd',
  'ddddeeddeedddd',
  '.dddddddddddd.',
  '..dddddddddd..',
] as const;
export const PIXEL_LOOK_COLORS = { d: '#484846', h: '#5c5c59', e: '#fdfdfc' };
