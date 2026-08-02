'use client';

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export default function FooterRobotMark() {
  const rootRef = useRef<HTMLSpanElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const attention = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 240, damping: 24 });
  const smoothY = useSpring(pointerY, { stiffness: 240, damping: 24 });
  const smoothAttention = useSpring(attention, { stiffness: 220, damping: 26 });
  const headX = useTransform(smoothX, [-1, 1], [-4, 4]);
  const headY = useTransform(smoothY, [-1, 1], [-2.8, 2.8]);
  const headRotate = useTransform(smoothX, [-1, 1], [-5.5, 5.5]);
  const eyeX = useTransform(smoothX, [-1, 1], [-1.4, 1.4]);
  const eyeY = useTransform(smoothY, [-1, 1], [-1, 1]);
  const opacity = useTransform(smoothAttention, [0, 1], [0.82, 1]);

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement) return;

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = rootElement.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);
      const projectHover = Boolean(
        (event.target as Element | null)?.closest?.('.minimal-row-link'),
      );
      const proximity = Math.max(0, 1 - distance / 360);
      const nextAttention = projectHover ? Math.max(0.78, proximity) : proximity;
      const nextX = projectHover && proximity < 0.12
        ? clamp((event.clientX - window.innerWidth / 2) / (window.innerWidth * 0.42))
        : clamp(deltaX / 135);
      const nextY = projectHover && proximity < 0.12 ? -0.9 : clamp(deltaY / 120);

      pointerX.set(nextX * nextAttention);
      pointerY.set(nextY * nextAttention);
      attention.set(nextAttention);
    };

    const handleWindowBlur = () => {
      pointerX.set(0);
      pointerY.set(0);
      attention.set(0);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [attention, pointerX, pointerY]);

  return (
    <span ref={rootRef} className="minimal-footer-robot-gallery" aria-hidden="true">
      <motion.span
        className="minimal-robot-option"
        drag
        dragElastic={0}
        dragMomentum={false}
        style={{ opacity }}
        whileDrag={{ scale: 1.08 }}
      >
        <svg viewBox="0 0 48 36" focusable="false">
          <motion.g
            className="minimal-robot-head-follow"
            style={{ x: headX, y: headY, rotate: headRotate }}
          >
            <rect className="minimal-robot-shell" x="7" y="8" width="34" height="23" rx="10" />
            <rect className="minimal-robot-screen" x="12" y="12" width="24" height="14" rx="6" />
            <motion.g className="minimal-robot-eyes" style={{ x: eyeX, y: eyeY }}>
              <rect x="18" y="16" width="3.6" height="6.8" rx="1.8" />
              <rect x="26.4" y="16" width="3.6" height="6.8" rx="1.8" />
            </motion.g>
          </motion.g>
        </svg>
      </motion.span>
    </span>
  );
}
