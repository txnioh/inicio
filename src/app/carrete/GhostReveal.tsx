import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ghostEasings, type CarreteSettings } from './settings';

// Original alpha masks from arlan.me/vault/ghosty-reveal (MIT).
export const ghostMasks = {
  vertical: '/carrete/ghost-mask.png',
  horizontal: '/carrete/ghost-mask-h.png',
};

export function ghostStyle(settings: CarreteSettings): CSSProperties {
  const horizontal = settings.ghostDirection === 'left' || settings.ghostDirection === 'right';
  const reverse = settings.ghostDirection === 'down' || settings.ghostDirection === 'right';
  // The reference grid stretches the mask to 600%. Larger scales make its
  // feathered front wider; the slider changes this without replacing its texture.
  const scale = 500 + settings.ghostSoftness;
  const far = horizontal ? '100% 0%' : '0% 100%';
  return {
    '--ghost-mask': `url("${horizontal ? ghostMasks.horizontal : ghostMasks.vertical}")`,
    '--ghost-size': horizontal ? `${scale}% 100%` : `100% ${scale}%`,
    // Skip the transparent lead-in of the original mask: the photo is already
    // emerging on the first frame, even while another tile starts its reveal.
    '--ghost-horizontal': horizontal ? 1 : 0,
    '--ghost-vertical': horizontal ? 0 : 1,
    '--ghost-to': far,
    // Mirror the mask and counter-mirror the content to reveal down/right
    // without reversing the photograph or animating from visible to hidden.
    '--ghost-flip': reverse ? horizontal ? 'scaleX(-1)' : 'scaleY(-1)' : 'none',
    '--ghost-duration': `${settings.ghostDuration}ms`,
    '--ghost-stagger': `${settings.ghostStagger}ms`,
    '--ghost-easing': ghostEasings[settings.ghostEasing].value,
  } as CSSProperties;
}

// Begin revealing as a tile enters the viewport. Re-arm it when it leaves,
// including tiles kept in the overscan area, so dragging back also reveals them.
export default function GhostReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [delay] = useState(Math.random);
  useEffect(() => {
    const element = ref.current!;
    if (typeof IntersectionObserver === 'undefined') { element.dataset.visible = 'true'; return; }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) element.dataset.visible = 'true';
        else {
          delete element.dataset.visible;
          delete element.dataset.complete;
        }
      }
    }, { threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="carrete-ghost-reveal"
    style={{ '--ghost-order': delay, '--ghost-start': `${26 + delay * 5}%` } as CSSProperties}
    onAnimationEnd={event => {
      if (event.target === event.currentTarget) event.currentTarget.dataset.complete = 'true';
    }}>
    <div className="carrete-ghost-content">{children}</div>
  </div>;
}
