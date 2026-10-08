import { useId } from 'react';

// Jumper from behind, as the loader: shell, the dark band under it and four
// arched legs. A pale silhouette fills with Jumper's colour from the feet up.
function Figure({ shell, band }: { shell: string; band: string }) {
  return <>
    {[-1, 1].map(side => <g key={side} transform={side < 0 ? 'translate(120 0) scale(-1 1)' : undefined} fill="none" stroke={shell} strokeLinecap="round">
      <path d="M77 26 C89 13 102 15 106 50" strokeWidth="8" />
      <path d="M75 31 C85 23 93 26 94 52" strokeWidth="9" />
    </g>)}
    <rect x="40" y="25" width="40" height="10" rx="3.5" fill={band} />
    <rect x="37" y="9" width="46" height="20" rx="8" fill={shell} />
  </>;
}

export default function LoadingJumper({ progress, shell }: { progress: number; shell: string }) {
  const clip = `jumper-loading-${useId().replace(/[^\w-]/g, '')}`;
  const top = 60 - 54 * Math.min(1, Math.max(0, progress / 100));
  return <svg className="jumper-loading-figure" viewBox="0 4 120 54" width="120" height="54" aria-hidden="true">
    <defs><clipPath id={clip}><rect className="jumper-loading-fill" x="0" y={top} width="120" height="60" /></clipPath></defs>
    <g className="jumper-loading-bob">
      <Figure shell="#ebeae5" band="#ebeae5" />
      <g clipPath={`url(#${clip})`}><Figure shell={shell} band="#2b2a27" /></g>
    </g>
  </svg>;
}
