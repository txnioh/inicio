import { useEffect, useRef, useState, type CSSProperties } from 'react';
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

// Split-flap style: when the text changes, the digits that changed shuffle
// through a couple of random ones before landing, like a Solari board. Updates
// that come faster than the shuffle (the fast clock speeds) just swap.
export function FlipText({ text, ...props }: Props) {
  const [face, setFace] = useState(text);
  const last = useRef({ text, at: 0 });
  useEffect(() => {
    const before = last.current;
    const now = performance.now();
    last.current = { text, at: now };
    if (before.text === text) return;
    if (now - before.at < 260 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFace(text);
      return;
    }
    const shuffle = () => [...text].map((char, i) => (/\d/.test(char) && char !== before.text[i] ? String(Math.floor(Math.random() * 10)) : char)).join('');
    setFace(shuffle());
    const timers = [window.setTimeout(() => setFace(shuffle()), 60), window.setTimeout(() => setFace(text), 120)];
    return () => timers.forEach(window.clearTimeout);
  }, [text]);
  return <PixelText {...props} text={face} />;
}
