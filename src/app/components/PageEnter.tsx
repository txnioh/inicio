'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { animate, stagger, useReducedMotion } from 'framer-motion';

type PageEnterProps = {
  children: ReactNode;
  className: string;
};

export default function PageEnter({ children, className }: PageEnterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement) return;

    const revealElements = Array.from(
      rootElement.querySelectorAll<HTMLElement>('.minimal-reveal-line'),
    );

    if (shouldReduceMotion) {
      revealElements.forEach((element) => {
        element.style.opacity = '1';
        element.style.transform = 'none';
      });
      return;
    }

    const controls = animate(
      revealElements,
      {
        opacity: 1,
        transform: 'translateY(0)',
      },
      {
        delay: stagger(0.034),
        duration: 0.26,
        ease: 'easeOut',
      },
    );

    return () => controls.stop();
  }, [shouldReduceMotion]);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
