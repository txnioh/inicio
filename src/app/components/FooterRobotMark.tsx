'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as motion from 'framer-motion/m';
import { useDragControls, useMotionValue } from 'framer-motion';
import { useGlobalAudioPlayer } from './GlobalAudioPlayer';
import useRobotGuide from './useRobotGuide';
import { RobotFace, RobotEffects, SpeechLetters } from './RobotVisuals';
import { robotPortalPose, robotHoleFrames } from './robotAnimation';

const gestures = ['wink', 'happy', 'surprised'] as const;
type Gesture = typeof gestures[number];

const lines = {
  hello: ['oh, hi.', 'hola, ¿qué tal?', 'me encontraste.'],
  wink: ['just between us.', 'queda entre nosotros.', 'beep. that means hello.'],
  happy: ['that tickles.', 'qué bien que estés aquí.', 'small robot, good company.'],
  surprised: ['oh!', 'uy, qué susto.', 'you have my attention.'],
  carried: ['con cuidadito.', 'a little field trip?', 'así que esto es volar.'],
  sleeping: ['just resting my pixels.', 'una siestecita.'],
  wake: ['oh, hi again.', 'yo no estaba durmiendo.'],
  music: ['esta me gusta.', 'tiny dance break.', 'un temita y seguimos.'],
} as const;
type SpeechCue = keyof typeof lines;
type Speech = { text: string; announce: boolean; context?: boolean };

export default function FooterRobotMark({ draggable = true }: { draggable?: boolean }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<HTMLSpanElement>(null);
  const entranceRef = useRef<HTMLSpanElement>(null);
  const holeRef = useRef<HTMLSpanElement>(null);
  const previousAnchor = useRef('home');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const phraseIndexes = useRef<Partial<Record<SpeechCue, number>>>({});
  const lastSpoken = useRef(0);
  const previousMood = useRef({ active: false, sleeping: false, isPlaying: false });
  const nextGesture = useRef(0);
  const suppressClick = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const { isPlaying, playbackRequested } = useGlobalAudioPlayer();
  const [heardMusic, setHeardMusic] = useState(false);
  const musicActive = isPlaying || (playbackRequested && heardMusic);
  const [attentive, setAttentive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [carried, setCarried] = useState(false);
  const [held, setHeld] = useState(false);
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [visibleSpeech, setVisibleSpeech] = useState<Speech | null>(null);
  const [constraints, setConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const explain = useCallback((text: string | null, announce = false) => {
    setSpeech(previous => text ? { text: text.toLocaleLowerCase(), announce, context: true } : previous?.context ? null : previous);
  }, []);
  const { x: positionX, y: positionY, mounted, active, anchor, departing, departureMs } = useRobotGuide({
    home: rootRef, stage: stageRef, enabled: draggable, grabbed: held || carried, playing: musicActive,
    reducedMotion, explain,
  });
  const shownSpeech = !departing && visibleSpeech === speech ? visibleSpeech : null;

  useLayoutEffect(() => {
    const changed = previousAnchor.current !== anchor;
    previousAnchor.current = anchor;
    const entrance = entranceRef.current;
    const hole = holeRef.current;
    if ((!changed && !departing) || !active || reducedMotion || held || carried || !entrance || !hole) return;

    // Leave through the upper hole before changing perches; emerge from below.
    // The button stays mounted so keyboard focus survives both animations.
    const emerge = entrance.animate([
      robotPortalPose(0, departing), robotPortalPose(1, departing),
    ], { duration: departing ? departureMs : 260, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: departing ? 'forwards' : 'none' });
    const opening = hole.animate(robotHoleFrames,
      { duration: departing ? departureMs : 380, easing: 'ease-out' });
    return () => { emerge.cancel(); opening.cancel(); };
  }, [anchor, active, reducedMotion, held, carried, departing, departureMs]);

  useEffect(() => {
    if (isPlaying) setHeardMusic(true);
    else if (!playbackRequested) setHeardMusic(false);
  }, [isPlaying, playbackRequested]);

  const say = useCallback((cue: SpeechCue, announce = false) => {
    if (!draggable || !active) return;
    // Ambient remarks leave a little quiet between them; direct play always responds.
    const now = Date.now();
    if (!announce && cue !== 'wake' && now - lastSpoken.current < 8_000) return;
    const index = phraseIndexes.current[cue] ?? 0;
    phraseIndexes.current[cue] = index + 1;
    lastSpoken.current = now;
    setSpeech({ text: lines[cue][index % lines[cue].length], announce });
  }, [active, draggable]);

  useEffect(() => {
    setVisibleSpeech(null);
    if (!active) {
      setSpeech(null);
      return;
    }
    if (!speech || departing) return;
    const delay = speech.context ? 160 : 650;
    const reveal = window.setTimeout(() => setVisibleSpeech(speech), delay);
    const dismiss = speech.context ? undefined : window.setTimeout(
      () => setSpeech(null), delay + Math.max(3_600, speech.text.length * 55),
    );
    return () => { window.clearTimeout(reveal); window.clearTimeout(dismiss); };
  }, [active, speech, departing]);

  useEffect(() => {
    const previous = previousMood.current;
    previousMood.current = { active, sleeping, isPlaying: musicActive };
    if (!active || carried || gesture) return;
    if (sleeping && !previous.sleeping) say('sleeping');
    else if (!sleeping && previous.sleeping) say('wake');
    else if (musicActive && !previous.isPlaying) say('music');
  }, [active, sleeping, musicActive, carried, gesture, say]);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    const root = stageRef.current;
    const button = buttonRef.current;
    if (!shownSpeech || !bubble || !root || !button) return;

    let frame = 0;
    const position = () => {
      frame = 0;
      const anchor = button.getBoundingClientRect();
      const face = button.querySelector('svg')?.getBoundingClientRect() ?? anchor;
      const origin = root.getBoundingClientRect();
      const { width, height } = bubble.getBoundingClientRect();
      const center = anchor.left + anchor.width / 2;
      // Beside the mobile music perch, keep the bubble above the transport controls.
      if (root.dataset.anchor === 'music' && face.top < height + 16 && face.left > width + 20) {
        const top = Math.max(8, face.top + face.height / 2 - height / 2);
        bubble.style.left = `${face.left - width - 12 - origin.left}px`;
        bubble.style.top = `${top - origin.top}px`;
        bubble.style.setProperty('--robot-speech-tail', `${Math.max(12, Math.min(face.top + face.height / 2 - top, height - 12))}px`);
        bubble.dataset.side = 'left';
        return;
      }
      const left = Math.max(8, Math.min(center - width / 2, window.innerWidth - width - 8));
      const below = face.top < height + 16;
      bubble.style.left = `${left - origin.left}px`;
      bubble.style.top = `${(below ? face.bottom + 8 : face.top - height - 8) - origin.top}px`;
      bubble.style.setProperty('--robot-speech-tail', `${Math.max(12, Math.min(center - left, width - 12))}px`);
      bubble.dataset.side = below ? 'below' : 'above';
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(position);
    };
    position();
    const unsubscribeX = dragX.on('change', schedule);
    const unsubscribeY = dragY.on('change', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribeX();
      unsubscribeY();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [shownSpeech, dragX, dragY, positionX, positionY]);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setSleeping(false);
    if (!draggable || !active || attentive || focused || held || carried || gesture || musicActive || anchor === 'guide') return;
    const timer = window.setTimeout(() => setSleeping(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [draggable, active, attentive, focused, held, carried, gesture, musicActive, anchor]);

  useEffect(() => {
    if (!held) return;
    const release = () => setHeld(false);
    const timer = window.setTimeout(() => { if (!carried) say('carried', true); }, 250);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [held, carried, say]);

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
    setHeld(false);
  }, [active, reducedMotion, dragControls, dragX, dragY]);


  const expression = !active || !draggable || departing ? 'idle'
    : held || carried ? 'carried'
    : gesture ?? (anchor === 'guide' ? 'idle' : musicActive ? 'music' : sleeping ? 'sleeping' : 'idle');


  const robot = (
    <span ref={stageRef}
      className={`minimal-footer-robot-gallery${draggable && mounted ? ' minimal-robot-companion' : ''}`}
      data-active={active} data-anchor={anchor} data-departing={departing}
      style={draggable && mounted ? { left: positionX, top: positionY } : undefined}
      data-expression={expression} aria-hidden={draggable ? undefined : true}>
      {draggable && <span ref={holeRef} className="minimal-robot-hole" aria-hidden="true" />}
      {draggable ? (
        <span ref={entranceRef} className="minimal-robot-entrance">
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
            style={{ x: dragX, y: dragY }}
            onFocus={() => {
              if (!active) rootRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
              setFocused(true);
              if (!speech?.context) say('hello');
            }}
            onBlur={() => setFocused(false)}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'mouse') return;
              setAttentive(true);
              if (!speech?.context) say('hello');
            }}
            onPointerLeave={() => setAttentive(false)}
            onKeyDown={(event) => { if (event.key === 'Escape') setSpeech(null); }}
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary) return;
              suppressClick.current = false;
              if (!reducedMotion) setHeld(true);
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
            onPointerCancel={() => { suppressClick.current = true; setHeld(false); }}
            onDragStart={() => {
              suppressClick.current = true;
              setGesture(null);
              setCarried(true);
              say('carried', true);
            }}
            onDragTransitionEnd={() => setCarried(false)}
            onClick={(event) => {
              if (event.detail > 0 && suppressClick.current) return;
              const next = gestures[nextGesture.current % gestures.length];
              setGesture(next);
              say(next, true);
              nextGesture.current += 1;
            }}
          >
            <RobotFace />
            <RobotEffects mode={expression} />
          </motion.button>
        </span>
      ) : (
        <span className="minimal-robot-option">
          <RobotFace />
        </span>
      )}
      {draggable && <>
        {active && shownSpeech && (
          <span key={shownSpeech.text} ref={bubbleRef} className="minimal-robot-speech" aria-hidden="true">
            <SpeechLetters text={shownSpeech.text} />
          </span>
        )}
        <span className="minimal-hidden-nav" role="status" aria-live="polite" aria-atomic="true">
          {active && shownSpeech?.announce ? shownSpeech.text : ''}
        </span>
      </>}
    </span>
  );
  return <span ref={rootRef} className="minimal-robot-home">
    {draggable && mounted ? createPortal(robot, document.body) : robot}
  </span>;
}
