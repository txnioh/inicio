// The clock as a seven-segment display, 5×9 pixels a digit, with unlit
// segments faintly visible. Matches the one drawn on the station plan.
const SEGMENTS: Record<string, string> = {
  a: 'M1 0h3v1h-3z', b: 'M4 1h1v3h-1z', c: 'M4 5h1v3h-1z', d: 'M1 8h3v1h-3z',
  e: 'M0 5h1v3h-1z', f: 'M0 1h1v3h-1z', g: 'M1 4h3v1h-3z',
};
const DIGITS: Record<string, string> = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

export default function SevenSeg({ text, unit = 4, colon = true }: { text: string; unit?: number; colon?: boolean }) {
  let x = 0;
  let on = '';
  let off = '';
  for (const char of text) {
    if (char === ':') {
      const dots = `M${x} 2h1v1h-1zM${x} 6h1v1h-1z`;
      if (colon) on += dots;
      else off += dots;
      x += 2;
      continue;
    }
    for (const [segment, d] of Object.entries(SEGMENTS)) {
      const moved = d.replace(/^M(\d+)/, (_, dx) => `M${x + Number(dx)}`);
      if ((DIGITS[char] ?? '').includes(segment)) on += moved;
      else off += moved;
    }
    x += 6;
  }
  const width = x - 1;
  return (
    <svg className="px-text trenes-seven" width={width * unit} height={9 * unit} viewBox={`0 0 ${width} 9`} shapeRendering="crispEdges" aria-hidden="true">
      <path className="trenes-seven-off" d={off} />
      <path d={on} />
    </svg>
  );
}
