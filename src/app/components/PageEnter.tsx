'use client';

import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';

type PageEnterProps = {
  children: ReactNode;
  className: string;
  skipAnimation?: boolean;
};

export default function PageEnter({ children, className, skipAnimation = false }: PageEnterProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement) return;

    const revealElements = Array.from(
      rootElement.querySelectorAll<HTMLElement>('.minimal-reveal-line'),
    );

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    if (skipAnimation || reducedMotion.matches) return;

    // CSS starts the visible entrance at first paint, even before hydration.
    // Only defer blocks below the viewport; never restart visible text on mount.
    const pendingElements = revealElements.filter(element => element.getBoundingClientRect().top >= innerHeight);
    const observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
        const element = entry.target as HTMLElement;
        element.style.animationDelay = `${Math.min(index * 75, 300)}ms`;
        element.classList.remove('minimal-reveal-pending');
        observer.unobserve(element);
      });
    }, { threshold: 0 });

    pendingElements.forEach(element => {
      element.classList.add('minimal-reveal-pending');
      observer.observe(element);
    });

    // A keyboard user can reach a link before its entrance has completed.
    const revealFocused = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>('.minimal-reveal-line');
      if (element) {
        observer.unobserve(element);
        element.classList.remove('minimal-reveal-pending');
        element.style.animation = 'none';
      }
    };
    const finish = () => {
      if (!reducedMotion.matches) return;
      observer.disconnect();
      pendingElements.forEach(element => element.classList.remove('minimal-reveal-pending'));
    };
    rootElement.addEventListener('focusin', revealFocused);
    reducedMotion.addEventListener('change', finish);

    return () => {
      observer.disconnect();
      revealElements.forEach(element => {
        element.classList.remove('minimal-reveal-pending');
        element.style.removeProperty('animation');
        element.style.removeProperty('animation-delay');
      });
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
