'use client';

import { useEffect, useRef, useState } from 'react';
import * as motion from 'framer-motion/m';
import { useDragControls, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useGlobalAudioPlayer } from './GlobalAudioPlayer';

const gestures = ['wink', 'happy', 'surprised'] as const;
type Gesture = typeof gestures[number];

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export default function FooterRobotMark({ draggable = true }: { draggable?: boolean }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nextGesture = useRef(0);
  const suppressClick = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const { isPlaying } = useGlobalAudioPlayer();
  const [active, setActive] = useState(false);
  const [attentive, setAttentive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [carried, setCarried] = useState(false);
  const [constraints, setConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
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
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const rootElement = rootRef.current;
    if (!rootElement) return;

    let inView = false;
    let windowFocused = true;
    const update = () => setActive(inView && windowFocused && !document.hidden);
    const blur = () => { windowFocused = false; update(); };
    const focus = () => { windowFocused = true; update(); };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(rootElement);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
    };
  }, []);

  useEffect(() => {
    setSleeping(false);
    if (!draggable || !active || attentive || focused || carried || gesture || isPlaying) return;
    const timer = window.setTimeout(() => setSleeping(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [draggable, active, attentive, focused, carried, gesture, isPlaying]);

  useEffect(() => {
    if (!active || !gesture) return;
    const timer = window.setTimeout(() => setGesture(null), 1_000);
    return () => window.clearTimeout(timer);
  }, [active, gesture]);

  useEffect(() => {
    if (!active) setGesture(null);
    if (active && !reducedMotion) return;
    dragControls.cancel();
    dragX.jump(0);
    dragY.jump(0);
    setCarried(false);
  }, [active, reducedMotion, dragControls, dragX, dragY]);

  useEffect(() => {
    if (!active || !matchMedia('(any-hover: hover) and (any-pointer: fine)').matches) return;

    let frame = 0;
    let latestEvent: PointerEvent | undefined;

    const updatePointer = () => {
      frame = 0;
      const event = latestEvent;
      // Read the moving button, so the eyes follow from its actual position.
      const element = buttonRef.current ?? rootRef.current;
      if (!event || !element) return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
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

      setAttentive(nextAttention > 0);
      if (!reducedMotion) {
        pointerX.set(nextX * nextAttention);
        pointerY.set(nextY * nextAttention);
        attention.set(nextAttention);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(updatePointer);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      latestEvent = event;
      schedule();
    };

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      latestEvent = undefined;
      setAttentive(false);
      pointerX.set(0);
      pointerY.set(0);
      attention.set(0);
      smoothX.jump(0);
      smoothY.jump(0);
      smoothAttention.jump(0);
    };

    const unsubscribeX = dragX.on('change', schedule);
    const unsubscribeY = dragY.on('change', schedule);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.documentElement.addEventListener('pointerleave', reset);

    return () => {
      unsubscribeX();
      unsubscribeY();
      reset();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.documentElement.removeEventListener('pointerleave', reset);
    };
  }, [active, attention, pointerX, pointerY, smoothX, smoothY, smoothAttention, dragX, dragY, reducedMotion]);

  const expression = !active || !draggable ? 'idle'
    : carried ? 'carried'
    : gesture ?? (isPlaying ? 'music' : sleeping ? 'sleeping' : 'idle');

  const face = (
    <svg viewBox="0 0 48 36" focusable="false" aria-hidden="true">
      <motion.g
        className="minimal-robot-head-follow"
        style={reducedMotion ? undefined : { x: headX, y: headY, rotate: headRotate }}
      >
        <g className="minimal-robot-expression">
          <rect className="minimal-robot-shell" x="7" y="8" width="34" height="23" rx="10" />
          <rect className="minimal-robot-screen" x="12" y="12" width="24" height="14" rx="6" />
          <motion.g className="minimal-robot-eyes" style={reducedMotion ? undefined : { x: eyeX, y: eyeY }}>
            <g className="minimal-robot-blink">
              <rect x="18" y="16" width="3.6" height="6.8" rx="1.8" />
              <rect x="26.4" y="16" width="3.6" height="6.8" rx="1.8" />
            </g>
          </motion.g>
        </g>
      </motion.g>
    </svg>
  );

  return (
    <span ref={rootRef} className="minimal-footer-robot-gallery" data-active={active}
      data-expression={expression} aria-hidden={draggable ? undefined : true}>
      {draggable ? (
        <motion.button
          ref={buttonRef}
          type="button"
          className="minimal-robot-option minimal-robot-button"
          aria-label="Play with the robot"
          drag={active && !reducedMotion}
          dragControls={dragControls}
          dragConstraints={constraints}
          dragElastic={0}
          dragMomentum={false}
          dragSnapToOrigin
          dragTransition={{ bounceStiffness: 260, bounceDamping: 26, restDelta: 0.1, restSpeed: 1 }}
          style={{ x: dragX, y: dragY, opacity: reducedMotion ? 1 : opacity }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPointerDown={(event) => {
            suppressClick.current = false;
            setSleeping(false);
            const bounds = event.currentTarget.getBoundingClientRect();
            // Keep the whole hit target inside the viewport, including near its edges.
            setConstraints({
              left: 8 - bounds.left + dragX.get(),
              right: window.innerWidth - 8 - bounds.right + dragX.get(),
              top: 8 - bounds.top + dragY.get(),
              bottom: window.innerHeight - 8 - bounds.bottom + dragY.get(),
            });
          }}
          onPointerCancel={() => { suppressClick.current = true; }}
          onDragStart={() => {
            suppressClick.current = true;
            setGesture(null);
            setCarried(true);
          }}
          onDragTransitionEnd={() => setCarried(false)}
          onClick={(event) => {
            if (event.detail > 0 && suppressClick.current) return;
            setGesture(gestures[nextGesture.current % gestures.length]);
            nextGesture.current += 1;
          }}
        >
          {face}
        </motion.button>
      ) : (
        <motion.span className="minimal-robot-option" style={reducedMotion ? undefined : { opacity }}>
          {face}
        </motion.span>
      )}
    </span>
  );
}
