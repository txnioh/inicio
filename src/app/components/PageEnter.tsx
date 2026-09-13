'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { animate, stagger, useReducedMotion } from 'framer-motion';

type PageEnterProps = {
  children: ReactNode;
  className: string;
  skipAnimation?: boolean;
};

export default function PageEnter({ children, className, skipAnimation = false }: PageEnterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement) return;

    const revealElements = Array.from(
      rootElement.querySelectorAll<HTMLElement>('.minimal-reveal-line'),
    );

    if (shouldReduceMotion || skipAnimation) {
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
  }, [shouldReduceMotion, skipAnimation]);

  return (
    <div ref={rootRef} className={`${className}${skipAnimation ? ' minimal-navigation-arrival' : ''}`}>
      {children}
    </div>
  );
}
