import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import RobotSkinSelector from './RobotSkinSelector';
import FooterRobotMark from './FooterRobotMark';
import type { RobotSkin } from './robotSkin';
import './robotWardrobe.css';

export default function RobotWardrobe() {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLElement>(null);
  const pointerInside = useRef(false);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<RobotSkin | null>(null);
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const origin = root.current?.getBoundingClientRect();
      const panel = bubble.current;
      if (!anchor || !origin || !panel) return;
      const left = Math.max(16, Math.min(anchor.right + 8 - panel.offsetWidth, innerWidth - panel.offsetWidth - 16));
      panel.style.left = `${left - origin.left}px`;
      panel.style.setProperty('--wardrobe-tail', `${anchor.left + anchor.width / 2 - left}px`);
      panel.dataset.side = anchor.top < panel.offsetHeight + 30 ? 'below' : 'above';
    };
    position();
    root.current?.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { passive: true });
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    pointerInside.current = false;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    const release = () => { pointerInside.current = false; };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    document.addEventListener('keydown', escape);
    return () => {
      release();
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !selection) return;
    const timer = window.setTimeout(() => close(true), 1100);
    return () => window.clearTimeout(timer);
  }, [open, selection, close]);

  return (
    <div ref={root} className="robot-wardrobe" onPointerDownCapture={() => { pointerInside.current = true; }} onBlur={event => {
      // Clicking a preview briefly focuses the page before its label focuses the radio.
      if (!pointerInside.current && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <FooterRobotMark dressing={open} />
      <button ref={trigger} type="button" className="robot-wardrobe-trigger"
        aria-label="Change robot skin" title="A little wardrobe"
        aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog"
        onClick={() => { setSelection(null); setOpen(value => !value); }}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9.5 6.5a2.5 2.5 0 1 1 4.1 1.9C12.6 9.2 12 9.5 12 11l8.3 5.1a1 1 0 0 1-.5 1.9H4.2a1 1 0 0 1-.5-1.9L12 11" />
        </svg>
      </button>
      {open && (
        <section ref={bubble} id={id} className="robot-wardrobe-bubble" role="dialog" aria-labelledby={`${id}-title`}
          data-changing={selection ?? undefined}>
          <div className="robot-wardrobe-heading">
            <h2 id={`${id}-title`}>A little change?</h2>
            <button type="button" className="robot-wardrobe-close" aria-label="Close wardrobe" onClick={() => close(true)}>
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
            </button>
          </div>
          <p className="robot-wardrobe-note">Same friend, different pixels.</p>
          <RobotSkinSelector previews onSelect={setSelection} />
          <span className="robot-wardrobe-caption" role="status">
            {selection ? 'Looking sharp.' : 'A tiny wardrobe. Just for me.'}
          </span>
        </section>
      )}
    </div>
  );
}
