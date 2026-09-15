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

    if (skipAnimation || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Content is visible at first paint; entry motion never gates reading or LCP.
    const animations = revealElements.map((element, index) => element.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { delay: index * 34, duration: 260, easing: 'ease-out', fill: 'backwards' },
    ));

    return () => animations.forEach(animation => animation.cancel());
  }, [skipAnimation]);

  return (
    <div ref={rootRef} className={`${className}${skipAnimation ? ' minimal-navigation-arrival' : ''}`}>
      {children}
    </div>
  );
}
