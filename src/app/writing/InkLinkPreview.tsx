import { useId } from 'react';
import { markerStroke, type Point } from './ink';
import { InkFilters, InkPaths } from './InkExample';

const strokes = ['#6A9BCC', '#629987', '#C46686'].map((color, i) => {
  const points: Point[] = Array.from({ length: 20 }, (_, step) => {
    const t = step / 19;
    return [8 + t * 78, 36 - t * t * (6 + i * 12)];
  });
  return markerStroke(points, { width: 5, color, seed: 17 + i, core: false });
});

export default function InkLinkPreview() {
  const id = `ink-preview-${useId().replace(/:/g, '')}`;
  return <svg viewBox="0 0 96 48" focusable="false">
    <InkFilters id={id} mode="grain" />
    {strokes.map((paths, i) => <g className="ink-preview-pass" key={i}
      style={{ animationDelay: `${i * 65}ms`, mixBlendMode: 'multiply' }}>
      <g filter={`url(#${id})`}><InkPaths paths={paths} /></g>
    </g>)}
  </svg>;
}
