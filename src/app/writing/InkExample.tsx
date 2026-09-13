import { useId } from 'react';
import { markerStroke, type InkPath, type Point } from './ink';

export function InkPaths({ paths }: { paths: InkPath[] }) {
  return paths.map((path, i) => <path key={i} d={path.d} fill={path.fill} fillOpacity={path.opacity} />);
}

export function InkFilters({ id, mode = 'full' }: { id: string; mode?: 'grain' | 'full' }) {
  return (
    <defs>
      <filter id={id} x="-18%" y="-25%" width="136%" height="150%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="2" seed="7" result="grain" />
        <feColorMatrix in="grain" type="luminanceToAlpha" result="alpha" />
        <feComposite in="SourceGraphic" in2="alpha" operator="arithmetic"
          k1="0" k2="1" k3="-.30" k4="0" result="ink" />
        {mode === 'full' && <>
          <feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="2" seed="11" result="warp" />
          <feDisplacementMap in="ink" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </>}
      </filter>
    </defs>
  );
}

// Synthetic data: a tiny illustration, not a measurement.
const points: Point[] = [[45, 130], [95, 132], [155, 102], [220, 114], [285, 66], [350, 77], [420, 39], [495, 49]];

export default function InkExample({ color = '#629987' }: { color?: string }) {
  const id = `ink-${useId().replace(/:/g, '')}`;
  const paths = markerStroke(points, { width: 8, color, seed: 17 });
  return (
    <svg viewBox="0 0 550 180" role="img" aria-label="An illustrative line rising across the page">
      <InkFilters id={id} />
      <g filter={`url(#${id})`} style={{ mixBlendMode: 'multiply' }}>
        <InkPaths paths={paths} />
      </g>
    </svg>
  );
}
