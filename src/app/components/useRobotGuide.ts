import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

type GuideOptions = {
  home: RefObject<HTMLSpanElement | null>;
  stage: RefObject<HTMLSpanElement | null>;
  enabled: boolean;
  grabbed: boolean;
  playing: boolean;
  reducedMotion: boolean;
  explain: (text: string | null, announce?: boolean) => void;
};
type Anchor = 'home' | 'guide' | 'music';
type Placement = { x: number; y: number; anchor: Anchor; active: boolean };

const fit = (value: number, max: number) => Math.max(24, Math.min(value, max - 24));
const inView = (box: DOMRect) => box.width > 0 && box.height > 0
  && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;

export default function useRobotGuide({ home, stage, enabled, grabbed, playing, reducedMotion, explain }: GuideOptions) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>('home');
  const [departing, setDeparting] = useState(false);
  const [departureMs, setDepartureMs] = useState(180);
  const placed = useRef(false);
  const currentAnchor = useRef<Anchor>('home');
  const target = useRef<HTMLElement | null>(null);
  const keyboard = useRef(false);
  const foreground = useRef(true);

  useLayoutEffect(() => {
    const origin = home.current;
    if (!origin) return;
    const player = document.querySelector<HTMLElement>('[data-robot-player]');
    let frame = 0;
    let dwell = 0;
    let leave = 0;
    let departure = 0;
    let destination: Placement | null = null;
    let dismissed: HTMLElement | null = null;

    const place = () => {
      if (!destination) return;
      const { x, y, anchor, active } = destination;
      placed.current = true;
      currentAnchor.current = anchor;
      departure = 0;
      setPosition(previous => previous.x === x && previous.y === y ? previous : { x, y });
      setAnchor(anchor);
      setActive(active);
      setDeparting(false);
    };

    const update = () => {
      frame = 0;
      const awake = foreground.current && !document.hidden;
      if (grabbed) {
        setDeparting(false);
        setActive(awake);
        return;
      }
      const homeBox = origin.getBoundingClientRect();
      let left = homeBox.left;
      let top = homeBox.top;
      let visible = inView(homeBox);
      let nextAnchor: Anchor = 'home';
      const guide = target.current;
      const guideBox = guide?.isConnected ? guide.getBoundingClientRect() : null;
      const playerBox = player?.getBoundingClientRect();
      if (guide && (!guideBox || !inView(guideBox))) {
        target.current = null;
        explain(null);
      }

      if (enabled && !playing && guideBox && inView(guideBox)) {
        const section = guide?.closest('[data-robot-companies]')?.getBoundingClientRect() ?? guideBox;
        // One predefined guide perch for both companies: in the outer margin,
        // or below their paragraph on compact screens. Never use pointer coordinates.
        const beside = innerWidth - section.right >= 264;
        left = fit(beside ? section.right + 144 : section.right - 24, innerWidth) - 14;
        top = (beside ? section.top + section.height / 2 : section.bottom + 26) - 10.5;
        visible = true;
        nextAnchor = 'guide';
      } else if (enabled && playing && playerBox) {
        // Use the outside margin on desktop and the space above the player on mobile.
        const beside = playerBox.right + 56 < innerWidth;
        left = fit(beside ? playerBox.right + 32 : playerBox.right - 18, innerWidth) - 14;
        top = (beside ? playerBox.top + playerBox.height / 2 : playerBox.top - 30) - 10.5;
        visible = inView(playerBox);
        nextAnchor = 'music';
      }
      // Document coordinates let the browser scroll the robot with its perch.
      // Repositioning never interpolates; the hole animations move only the drawing.
      const x = left + window.scrollX;
      const y = top + window.scrollY;
      destination = { x, y, anchor: nextAnchor, active: awake && visible };
      const currentBox = stage.current?.getBoundingClientRect();
      if (nextAnchor !== currentAnchor.current && placed.current && enabled
        && !reducedMotion && awake && currentBox && inView(currentBox)) {
        if (!departure) {
          const duration = nextAnchor === 'home' ? 380 : 180;
          setDepartureMs(duration);
          setDeparting(true);
          departure = window.setTimeout(place, duration);
        }
        return;
      }
      window.clearTimeout(departure);
      place();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const clearTarget = () => {
      window.clearTimeout(dwell);
      window.clearTimeout(leave);
      leave = 0;
      target.current = null;
      explain(null);
      schedule();
    };
    const select = (element: EventTarget | null, fromKeyboard = false) => {
      if (!enabled || grabbed || playing || !(element instanceof Element)) return;
      if (element.closest('.minimal-robot-companion')) return;
      const next = element.closest<HTMLElement>('[data-robot-company]');
      if (next !== dismissed) dismissed = null;
      if (!next || next === dismissed) {
        window.clearTimeout(dwell);
        // Keep the current explanation visible for half a second before leaving.
        if (target.current && !leave) leave = window.setTimeout(clearTarget, 500);
        return;
      }
      window.clearTimeout(leave);
      leave = 0;
      const changedInput = keyboard.current !== fromKeyboard;
      keyboard.current = fromKeyboard;
      if (next === target.current) {
        if (fromKeyboard && changedInput) explain(next.dataset.robotNote ?? null, true);
        schedule();
        return;
      }
      window.clearTimeout(dwell);
      target.current = next;
      explain(null);
      update();
      dwell = window.setTimeout(() => {
        if (next.isConnected) explain(next.dataset.robotNote ?? null, fromKeyboard);
      }, fromKeyboard ? 0 : 80);
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      select(event.target);
    };
    const out = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') select(event.relatedTarget ?? document.body);
    };
    const focusIn = (event: FocusEvent) => select(event.target, true);
    const focusOut = (event: FocusEvent) => select(event.relatedTarget ?? document.body, true);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dismissed = target.current;
      clearTarget();
    };
    const blur = () => { foreground.current = false; clearTarget(); update(); };
    const focus = () => { foreground.current = true; update(); };
    const visibility = () => { if (document.hidden) clearTarget(); update(); };

    if (grabbed) {
      clearTarget();
    }
    if (playing) clearTarget();
    update();
    setMounted(true);
    const resize = new ResizeObserver(schedule);
    resize.observe(origin.closest('.minimal-homepage') ?? origin);
    if (player) resize.observe(player);
    if (enabled) {
      document.addEventListener('pointerover', enter, { passive: true });
      document.addEventListener('pointerout', out, { passive: true });
      document.addEventListener('focusin', focusIn);
      document.addEventListener('focusout', focusOut);
      document.addEventListener('keydown', escape);
      document.documentElement.addEventListener('pointerleave', clearTarget);
    }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(dwell);
      window.clearTimeout(leave);
      window.clearTimeout(departure);
      resize.disconnect();
      document.removeEventListener('pointerover', enter);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('keydown', escape);
      document.documentElement.removeEventListener('pointerleave', clearTarget);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [home, stage, enabled, grabbed, playing, reducedMotion, explain]);

  return { ...position, mounted, active, anchor, departing, departureMs };
}
