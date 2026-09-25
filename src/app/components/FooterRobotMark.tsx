'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as motion from 'framer-motion/m';
import { useDragControls, useMotionValue } from 'framer-motion';
import { useGlobalAudioPlayer } from './GlobalAudioPlayer';
import useRobotGuide from './useRobotGuide';
import { RobotFace, RobotEffects, RobotSpeech } from './RobotVisuals';
import { robotPortalPose, robotHoleFrames, PIXEL_PORTAL_MS } from './robotAnimation';
import { useRobotSkin } from './robotSkin';
import RobotSkinReveal from './RobotSkinReveal';

// Taps cycle through these. The pixel face also plays whole animations
// from /robot (`play:`); the classic one only has CSS expressions.
const gestures = {
  classic: ['wink', 'happy', 'surprised'],
  pixel: ['play:sixseven', 'play:backflip', 'play:chinese', 'play:skate', 'play:fan', 'play:rave', 'play:thumbsup'],
} as const;
type Gesture = typeof gestures[keyof typeof gestures][number] | 'play:angry';
// Played animations end when the face says so (see endActivity); this is
// only a fallback for when it cannot, e.g. off screen.
const gestureMs = (gesture: Gesture) => gesture.startsWith('play:') ? 5_000 : 1_000;
// These speak through the animation itself, so they say nothing.
const silent = new Set<Gesture>(['play:sixseven', 'play:chinese', 'play:skate', 'play:fan', 'play:thumbsup']);
// Held this long without moving, the robot notices it is being pressed.
const LONG_PRESS_MS = 700;
// A press only turns into a drag past this distance, so a finger resting on
// the robot (or a slightly shaky click) never moves it.
const DRAG_FROM = { mouse: 4, touch: 10 };
// This many taps in a short while is poking.
const POKES = 5;
const POKE_WINDOW_MS = 2_500;

// Everything the robot says, in Antonio's own way of talking: lowercase,
// Spain Spanish, short and a bit cheeky. The pixel font has no quotes.
const lines = {
  hello: ['ey, qué pasa', 'hola hola', 'vale, me has encontrado', 'vienes a jugar, no?', 'a ver, qué se cuenta'],
  wink: ['esto queda entre nosotros', 'tú no has visto nada', 'guiño guiño, ya sabes'],
  happy: ['esto sí que sí', 'me alegra verte por aquí', 'buen rollo nivel máximo'],
  surprised: ['uy, no te había visto', 'a ver a ver, qué ha sido eso', 'me has pillado desprevenido'],
  tickle: ['jajaja para para', 'eso son cosquillas y lo sabes', 'jajaja vale ya'],
  love: ['te quiero en binario, 01', 'contigo, sin ruido', 'me caes bien, que lo sepas'],
  backflip: ['mortal hacia atrás, toma ya', 'eso ha sido limpio, no?'],
  rave: ['dónde está mi supertraje?', 'modo rave activado'],
  angry: ['vale vale, ya está bien', 'un clic vale, veinte no', 'que no soy un botón jajaja'],
  carried: ['con cuidadito, eh', 'a dónde vamos?', 'esto no lo tenía planeado', 'ojo que me mareo'],
  pressed: ['eso aprieta, eh', 'que no soy un botón', 'modo sándwich activado', 'vale, ya me has aplastado'],
  released: ['boing', 'vale, vuelvo a mi forma', 'uf, qué alivio'],
  sleeping: ['cinco minutitos', 'recargando píxeles', 'zzz… sin ruido porfa'],
  wake: ['estaba despierto, lo prometo', 'vale vale, ya estoy', 'no dormía, tipo descansaba'],
  music: ['esta me flipa', 'dale, que suene', 'este temazo no se salta'],
  wardrobe: ['me cambio de look?', 'ese me queda mejor, no?', 'a ver qué tal me queda'],
  dressedPixel: ['qué tal me queda?', 'en pixel art, como debe ser', 'menos píxeles pero más gordos'],
  dressedClassic: ['vuelta al original', 'lo de siempre, que funciona', 'más redondito otra vez'],
} as const;
type SpeechCue = keyof typeof lines;

// Pixel skin: things the robot gets up to on its own at home, each an
// animation from /robot with a line that explains it. The newest ones play
// on a tap instead; the plainer ones stay in the /robot gallery.
const activities = {
  coffee: ['un cafecito y seguimos', 'café primero, commits después'],
  paint: ['pintando en pixel art', 'no escatimes en detalles'],
  wish: ['pide un deseo, rápido', 'has visto eso?'],
  sneeze: ['achís, perdón', 'alergia a los bugs'],
  glitch: ['eso no ha pasado', 'se ha quedado pillado, ya está'],
} satisfies Record<string, string[]>;
type Activity = keyof typeof activities | 'dizzy';
type Speech = { text: string; announce: boolean; context?: boolean };

// `dressing` is true while a new look flies over from the wardrobe;
// `dressedAt` marks when it lands; `eyeing` while the wardrobe is pointed at.
export default function FooterRobotMark({ draggable = true, dressing = false, dressedAt = null, eyeing = false }: {
  draggable?: boolean; dressing?: boolean; dressedAt?: number | null; eyeing?: boolean;
}) {
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
  const heldAt = useRef(0);
  const pressFrom = useRef({ x: 0, y: 0, touch: false });
  const taps = useRef<number[]>([]);
  // Where the eyes point, in art pixels; read by the pixel face each frame.
  const look = useRef<[number, number]>([0, 0]);
  const [restless, setRestless] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const skin = useRobotSkin();
  const { isPlaying, playbackRequested } = useGlobalAudioPlayer();
  const [heardMusic, setHeardMusic] = useState(false);
  const musicActive = isPlaying || (playbackRequested && heardMusic);
  const [attentive, setAttentive] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [carried, setCarried] = useState(false);
  const [arrival, setArrival] = useState<number | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const lastActivity = useRef<Activity | null>(null);
  const [held, setHeld] = useState(false);
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [visibleSpeech, setVisibleSpeech] = useState<Speech | null>(null);
  const revealed = useRef<Speech | null>(null);
  const [constraints, setConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const dragControls = useDragControls();
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const explain = useCallback((text: string | null, announce = false) => {
    setSpeech(previous => text ? { text: text.toLocaleLowerCase(), announce, context: true } : previous?.context ? null : previous);
  }, []);
  const { x: positionX, y: positionY, mounted, active, anchor, departing, departureMs } = useRobotGuide({
    home: rootRef, stage: stageRef, enabled: draggable, grabbed: held || carried || dressing, playing: musicActive,
    reducedMotion, explain, portalMs: skin === 'pixel' ? PIXEL_PORTAL_MS : undefined,
  });
  const shownSpeech = !dressing && !departing && visibleSpeech === speech ? visibleSpeech : null;

  useLayoutEffect(() => {
    const changed = previousAnchor.current !== anchor;
    previousAnchor.current = anchor;
    const entrance = entranceRef.current;
    const hole = holeRef.current;
    if ((!changed && !departing) || !active || reducedMotion || held || carried || !entrance || !hole) return;

    // Leave through the upper hole before changing perches; emerge from below.
    // The button stays mounted so keyboard focus survives both animations.
    // The pixel face draws its own portal: leaving follows `departing`,
    // arriving starts here, once the robot is at its new perch.
    if (skin === 'pixel') {
      if (!departing) setArrival(Date.now());
      return;
    }
    const emerge = entrance.animate([
      robotPortalPose(0, departing), robotPortalPose(1, departing),
    ], { duration: departing ? departureMs : 260, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: departing ? 'forwards' : 'none' });
    const opening = hole.animate(robotHoleFrames,
      { duration: departing ? departureMs : 380, easing: 'ease-out' });
    return () => { emerge.cancel(); opening.cancel(); };
  }, [anchor, active, reducedMotion, held, carried, departing, departureMs, skin]);

  useEffect(() => {
    if (arrival === null) return;
    if (held || carried) {
      setArrival(null);
      return;
    }
    const timer = window.setTimeout(() => setArrival(null), PIXEL_PORTAL_MS);
    return () => window.clearTimeout(timer);
  }, [arrival, held, carried]);

  useEffect(() => {
    if (isPlaying) setHeardMusic(true);
    else if (!playbackRequested) setHeardMusic(false);
  }, [isPlaying, playbackRequested]);

  const speak = useCallback((text: string, announce = false, always = announce) => {
    if (!draggable || !active) return;
    // Ambient remarks leave a little quiet between them; direct play always responds.
    const now = Date.now();
    if (!always && now - lastSpoken.current < 8_000) return;
    lastSpoken.current = now;
    setSpeech({ text, announce });
  }, [active, draggable]);

  const say = useCallback((cue: SpeechCue, announce = false) => {
    const index = phraseIndexes.current[cue] ?? 0;
    phraseIndexes.current[cue] = index + 1;
    speak(lines[cue][index % lines[cue].length], announce, announce || cue === 'wake');
  }, [speak]);

  // Pixel skin: when left alone at home, pick a new activity every so often.
  const idleAtHome = skin === 'pixel' && draggable && active && !dressing && !reducedMotion && anchor === 'home'
    && !departing && !attentive && !focused && !held && !carried && !gesture && !musicActive && !sleeping;
  useEffect(() => {
    if (!idleAtHome || activity) return;
    const timer = window.setTimeout(() => {
      const options = (Object.keys(activities) as (keyof typeof activities)[]).filter(id => id !== lastActivity.current);
      const next = options[Math.floor(Math.random() * options.length)];
      const phrases: string[] = activities[next];
      lastActivity.current = next;
      setActivity(next);
      speak(phrases[Math.floor(Math.random() * phrases.length)]);
    }, 7_000 + Math.random() * 5_000);
    return () => window.clearTimeout(timer);
  }, [idleAtHome, activity, speak]);

  // Being handled, dancing or leaving interrupts whatever it was doing.
  useEffect(() => {
    if (skin !== 'pixel' || dressing || held || carried || gesture || musicActive || departing || !active) setActivity(null);
  }, [skin, dressing, held, carried, gesture, musicActive, departing, active]);

  // A safety net in case the face never reports the end (e.g. off screen).
  useEffect(() => {
    if (!activity) return;
    const timer = window.setTimeout(() => setActivity(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [activity]);

  useEffect(() => {
    setVisibleSpeech(null);
    if (!active) {
      setSpeech(null);
      return;
    }
    if (!speech) return;
    // A line already said stays behind when the robot leaves its perch;
    // one still waiting to be shown is said at the new perch instead.
    if (departing) {
      if (revealed.current === speech) setSpeech(null);
      return;
    }
    const delay = speech.context ? 160 : 650;
    const reveal = window.setTimeout(() => {
      revealed.current = speech;
      setVisibleSpeech(speech);
    }, delay);
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
      const face = button.querySelector('[data-robot-face]')?.getBoundingClientRect() ?? anchor;
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
      // The pixel bubble's tail is shorter, so it can sit a little closer;
      // activities (flips, lasers, a bubble of their own) need headroom.
      const gap = (root.dataset.skin === 'pixel' ? 5 : 8) + (root.dataset.expression?.startsWith('activity:') ? 12 : 0);
      bubble.style.left = `${left - origin.left}px`;
      bubble.style.top = `${(below ? face.bottom + gap : face.top - height - gap) - origin.top}px`;
      bubble.style.setProperty('--robot-speech-tail', `${Math.max(12, Math.min(center - left, width - 12))}px`);
      bubble.dataset.side = below ? 'below' : 'above';
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(position);
    };
    position();
    // The pixel bubble loads its text canvas after mounting; place it again then.
    const resize = new ResizeObserver(schedule);
    resize.observe(bubble);
    const unsubscribeX = dragX.on('change', schedule);
    const unsubscribeY = dragY.on('change', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
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
    if (!draggable || !active || dressing || attentive || focused || held || carried || gesture || musicActive || anchor === 'guide') return;
    // The pixel robot keeps itself busy with activities before dozing off.
    const timer = window.setTimeout(() => setSleeping(true), skin === 'pixel' ? 40_000 : 12_000);
    return () => window.clearTimeout(timer);
  }, [draggable, active, dressing, attentive, focused, held, carried, gesture, musicActive, anchor, skin, restless]);

  // The eyes follow the cursor anywhere on the page. Moving it also keeps
  // the robot awake; it only dozes off once the cursor has been still.
  useEffect(() => {
    if (!draggable || reducedMotion) return;
    let frame = 0;
    let x: number | null = null;
    let y = 0;
    let nudged = 0;
    const update = () => {
      frame = 0;
      const face = buttonRef.current?.querySelector('[data-robot-face]')?.getBoundingClientRect();
      if (!face || x === null) return;
      const dx = x - (face.left + face.width / 2);
      const dy = y - (face.top + face.height / 2);
      // Full deflection from 60px away; closer in, the eyes drift to the centre.
      const reach = Math.max(Math.hypot(dx, dy), 60);
      const next: [number, number] = [Math.round(dx / reach * 2), Math.max(-1, Math.min(1, Math.round(dy / reach * 1.6)))];
      look.current = next;
      stageRef.current?.style.setProperty('--robot-look-x', `${next[0] * 2.5}px`);
      stageRef.current?.style.setProperty('--robot-look-y', `${next[1] * 2.5}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      schedule();
      if (event.timeStamp - nudged > 1_000) {
        nudged = event.timeStamp;
        setRestless(value => value + 1);
      }
    };
    // On touch screens there is no hover: the eyes look where you tap.
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
      window.removeEventListener('scroll', schedule);
    };
  }, [draggable, reducedMotion]);

  useEffect(() => {
    if (!held) return;
    // Letting go after a long press without moving: it springs back.
    const release = () => {
      if (!suppressClick.current && Date.now() - heldAt.current >= LONG_PRESS_MS) {
        suppressClick.current = true;
        setGesture('happy');
        say('released', true);
      }
      setHeld(false);
    };
    // Start dragging only once the pointer has really travelled.
    const move = (event: PointerEvent) => {
      if (carried || suppressClick.current || !event.isPrimary) return;
      const { x, y, touch } = pressFrom.current;
      if (Math.hypot(event.clientX - x, event.clientY - y) < (touch ? DRAG_FROM.touch : DRAG_FROM.mouse)) return;
      dragControls.start(event);
    };
    const timer = window.setTimeout(() => { if (!carried) say('pressed', true); }, LONG_PRESS_MS + 300);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [held, carried, say, dragControls]);

  // Pointing at the wardrobe gets a remark, so its link to the robot is clear.
  useEffect(() => {
    if (!eyeing) return;
    setSleeping(false);
    say('wardrobe');
  }, [eyeing, say]);

  // A new look: a happy little wiggle and a word about it.
  useEffect(() => {
    if (dressedAt === null) return;
    setSleeping(false);
    setGesture('happy');
    say(skin === 'pixel' ? 'dressedPixel' : 'dressedClassic', true);
    // Only a new change of clothes should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dressedAt]);

  useEffect(() => {
    if (!active || !gesture) return;
    const timer = window.setTimeout(() => setGesture(null), gestureMs(gesture));
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


  const expression = !active || !draggable || departing || dressing ? 'idle'
    : carried ? 'carried' : held ? 'pressed'
    : gesture ?? (anchor === 'guide' ? 'idle' : musicActive ? 'music'
      : activity ? `activity:${activity}` : sleeping ? 'sleeping' : 'idle');


  const endActivity = useCallback(() => {
    setActivity(null);
    setGesture(current => current?.startsWith('play:') ? null : current);
  }, []);
  const portal = skin !== 'pixel' || !active || reducedMotion ? null
    : departing ? 'leaving' : arrival !== null ? 'arriving' : null;

  const robot = (
    <span ref={stageRef}
      className={`minimal-footer-robot-gallery${draggable && mounted ? ' minimal-robot-companion' : ''}`}
      data-active={active} data-anchor={anchor} data-departing={departing}
      style={draggable && mounted ? { left: positionX, top: positionY } : undefined}
      data-expression={expression} data-skin={skin} data-portal={portal ? '' : undefined} aria-hidden={draggable ? undefined : true}>
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
            dragListener={false}
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
              heldAt.current = Date.now();
              pressFrom.current = { x: event.clientX, y: event.clientY, touch: event.pointerType !== 'mouse' };
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
            // No long-press menu or magnifier on touch screens: holding squashes it.
            onContextMenu={(event) => event.preventDefault()}
            onDragStart={() => {
              suppressClick.current = true;
              setGesture(null);
              setCarried(true);
              say('carried', true);
            }}
            onDragTransitionEnd={() => {
              setCarried(false);
              if (skin === 'pixel' && !reducedMotion) setActivity('dizzy');
            }}
            onClick={(event) => {
              if (event.detail > 0 && suppressClick.current) return;
              const now = Date.now();
              taps.current = [...taps.current.filter(at => now - at < POKE_WINDOW_MS), now];
              if (taps.current.length >= POKES) {
                taps.current = [];
                setGesture(skin === 'pixel' ? 'play:angry' : 'surprised');
                say('angry', true);
                return;
              }
              const cycle = gestures[skin];
              const next = cycle[nextGesture.current % cycle.length];
              setGesture(next);
              if (!silent.has(next)) say(next.replace('play:', '') as SpeechCue, true);
              nextGesture.current += 1;
            }}
          >
            <RobotSkinReveal skin={skin} reducedMotion={reducedMotion} expression={expression} portal={portal} portalKey={arrival} onActivityEnd={endActivity} look={look} />
            <RobotEffects mode={expression} skin={skin} />
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
            <RobotSpeech text={shownSpeech.text} skin={skin} />
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
