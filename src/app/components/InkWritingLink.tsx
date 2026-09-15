import { lazy, Suspense, useState } from 'react';

const InkLinkPreview = lazy(() => import('../writing/InkLinkPreview'));

export default function InkWritingLink() {
  const [hasPreview, setHasPreview] = useState(false);
  const showPreview = () => {
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) setHasPreview(true);
  };
  return <a className="minimal-row-link minimal-reveal-line ink-writing-link" href="/writing/ink"
    onPointerEnter={(event) => { if (event.pointerType === 'mouse') showPreview(); }} onFocus={showPreview}>
    <span className="ink-writing-preview" aria-hidden="true">
      {hasPreview && <Suspense fallback={null}><InkLinkPreview /></Suspense>}
    </span>
    <h2 className="ink-title">Making SVG feel like ink</h2>
    <span className="minimal-row-meta"><span>2026</span><span aria-hidden="true">/</span><span>Read</span></span>
  </a>;
}
