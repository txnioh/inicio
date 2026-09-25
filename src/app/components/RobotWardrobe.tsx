import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import FooterRobotMark from './FooterRobotMark';
import { HANGER, PixelSprite, PixelTag } from './PixelSprite';
import { RobotFace } from './RobotVisuals';
import { robotSkins, setRobotSkin, useRobotSkin, type RobotSkin } from './robotSkin';
import './robotWardrobe.css';

const names: Record<RobotSkin, string> = { classic: 'Normal', pixel: 'Pixel' };

// After a change the rail stays long enough to see the swap, then folds away.
const CLOSE_AFTER_MS = 1300;
const FOLD_MS = 240;

export default function RobotWardrobe() {
  const id = useId();
  const worn = useRobotSkin();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [folding, setFolding] = useState(false);
  const [changedAt, setChangedAt] = useState<number | null>(null);

  const close = useCallback((restoreFocus = false) => {
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
    setFolding(true);
  }, []);

  useEffect(() => {
    if (!folding) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => {
      setOpen(false);
      setFolding(false);
      setChangedAt(null);
    }, reduced ? 0 : FOLD_MS);
    return () => window.clearTimeout(timer);
  }, [folding]);

  // Dismiss on Escape or a press anywhere else.
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);

  useEffect(() => {
    if (changedAt === null) return;
    const timer = window.setTimeout(() => close(), CLOSE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [changedAt, close]);

  const shown = open || folding;

  return (
    <div ref={root} className="robot-wardrobe">
      <FooterRobotMark dressing={shown} />
      <button ref={trigger} type="button" className="robot-wardrobe-trigger"
        aria-label="Change the robot's look" title="Wardrobe"
        aria-expanded={open && !folding} aria-controls={shown ? id : undefined}
        onClick={() => (open && !folding ? close() : (setFolding(false), setOpen(true)))}>
        <PixelSprite rows={HANGER} unit={1} />
      </button>
      {shown && (
        <div id={id} className="robot-wardrobe-rail" role="radiogroup" aria-label="Robot look"
          data-folding={folding || undefined} data-changed={changedAt !== null || undefined}>
          <span className="robot-wardrobe-bar" aria-hidden="true" />
          {robotSkins.map((option, index) => {
            const onRobot = option === worn;
            return (
              <label key={option} className="robot-wardrobe-slot" style={{ '--i': index } as CSSProperties}
                data-worn={onRobot || undefined}>
                <input className="minimal-hidden-nav" type="radio" name={id} value={option} checked={onRobot}
                  onChange={() => { setRobotSkin(option); setChangedAt(Date.now()); }}
                  aria-label={onRobot ? `${names[option]}, wearing it` : names[option]} />
                <span className="robot-wardrobe-hanger">
                  <PixelSprite className="robot-wardrobe-wire" rows={HANGER} />
                  {/* Both looks stay on the rail; the worn one dithers away. */}
                  <span className="robot-wardrobe-outfit" data-away={onRobot || undefined}>
                    <span className="minimal-footer-robot-gallery" data-skin={option} data-expression="idle" aria-hidden="true">
                      <span className="minimal-robot-option"><RobotFace skin={option} /></span>
                    </span>
                  </span>
                  <PixelTag key={String(onRobot)} className="robot-wardrobe-tag" text={onRobot ? 'wearing' : names[option]} dotted={onRobot} />
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
