import type { CSSProperties } from 'react';
import { layout, type Font } from './pixelType';

// The dissolve lands in this many interleaved batches, 32 ms apart.
const BUCKETS = 8;

type Props = { text: string; font?: Font; unit?: number; reveal?: boolean; className?: string };

// Text drawn as whole pixels in an SVG, so it stays crisp at any zoom and
// takes its colour from CSS. With `reveal`, a change dissolves the new text in.
export default function PixelText({ text, font = 'small', unit = 2, reveal = false, className }: Props) {
  const { width, height, paths } = layout(text, font, reveal ? BUCKETS : 1);
  return (
    <svg
      key={reveal ? text : undefined}
      className={className ? `px-text ${className}` : 'px-text'}
      data-reveal={reveal || undefined}
      width={width * unit}
      height={height * unit}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {paths.map((d, index) => <path key={index} d={d} style={reveal ? { '--d': `${index * 32}ms` } as CSSProperties : undefined} />)}
    </svg>
  );
}
