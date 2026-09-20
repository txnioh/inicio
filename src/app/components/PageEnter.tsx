'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

type PageEnterProps = {
  children: ReactNode;
  className: string;
  skipAnimation?: boolean;
};

export default function PageEnter({ children, className, skipAnimation = false }: PageEnterProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement) return;

    const revealElements = Array.from(
      rootElement.querySelectorAll<HTMLElement>('.minimal-reveal-line'),
    );

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    if (skipAnimation || reducedMotion.matches) return;

    // The prerendered page stays readable without JavaScript. Animate each block
    // once, when it enters the viewport, so lower sections keep their entrance.
    const animations = new Map(revealElements.map(element => {
      const animation = element.animate(
        [
          { opacity: 0, filter: 'blur(10px)', transform: 'translateY(4px) scale(1.025)' },
          { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0) scale(1)' },
        ],
        { duration: 720, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
      );
      animation.pause();
      return [element, animation] as const;
    }));

    const observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
        const animation = animations.get(entry.target as HTMLElement);
        animation?.effect?.updateTiming({ delay: Math.min(index * 75, 300) });
        animation?.play();
        observer.unobserve(entry.target);
      });
    }, { threshold: 0 });

    revealElements.forEach(element => observer.observe(element));

    // A keyboard user can reach a link before its entrance has completed.
    const revealFocused = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>('.minimal-reveal-line');
      if (element) {
        observer.unobserve(element);
        animations.get(element)?.finish();
      }
    };
    const finish = () => {
      if (!reducedMotion.matches) return;
      observer.disconnect();
      animations.forEach(animation => animation.cancel());
    };
    rootElement.addEventListener('focusin', revealFocused);
    reducedMotion.addEventListener('change', finish);

    return () => {
      observer.disconnect();
      animations.forEach(animation => animation.cancel());
      rootElement.removeEventListener('focusin', revealFocused);
      reducedMotion.removeEventListener('change', finish);
    };
  }, [skipAnimation]);

  return (
    <div ref={rootRef} className={`${className}${skipAnimation ? ' minimal-navigation-arrival' : ''}`}>
      {children}
    </div>
  );
}
