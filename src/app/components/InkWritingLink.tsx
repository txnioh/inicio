import { lazy, Suspense, useState } from 'react';

const InkLinkPreview = lazy(() => import('../writing/InkLinkPreview'));

export default function InkWritingLink() {
  const [hasPreview, setHasPreview] = useState(false);
  return <a className="minimal-row-link minimal-reveal-line ink-writing-link" href="/writing/ink"
    onPointerEnter={() => setHasPreview(true)} onFocus={() => setHasPreview(true)}>
    <span className="ink-writing-preview" aria-hidden="true">
      {hasPreview && <Suspense fallback={null}><InkLinkPreview /></Suspense>}
    </span>
    <h2 className="ink-title">Making SVG feel like ink</h2>
    <span className="minimal-row-meta"><span>2026</span><span aria-hidden="true">/</span><span>Read</span></span>
  </a>;
}
