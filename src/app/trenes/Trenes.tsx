import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import DayStrip from './DayStrip';
import { PixelSprite } from '../components/PixelSprite';
import PixelText from './PixelText';
import { ANNOUNCE, ARRIVE, BOARD, CLOSE, around, clock, dateLabel, madridOffset, phase, serviceNames, upcoming, type Train } from './schedule';
import { chime, click, nudge, setSound } from './sound';
import { setScheme, useScheme } from './theme';
import StationMap, { trackColor, useCrispScale, walkMinutes, W as MAP_W } from './StationMap';
import './trenes.css';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

const realMinute = () => {
  const ms = Date.now();
  return (ms + madridOffset(ms)) / 60000;
};

// `?hora=19:30` opens the station at that time today, to share a moment.
const startMinute = () => {
  const now = realMinute();
  const match = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('hora') ?? '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return now;
  return Math.floor(now / 1440) * 1440 + Number(match[1]) * 60 + Number(match[2]);
};

const SPEAKER_ON = [
  '...#.....',
  '..##..#..',
  '####...#.',
  '####.#.#.',
  '####.#.#.',
  '####...#.',
  '..##..#..',
  '...#.....',
];
const SPEAKER_OFF = [
  '...#.....',
  '..##.....',
  '####.#.#.',
  '####..#..',
  '####..#..',
  '####.#.#.',
  '..##.....',
  '...#.....',
];

const SUN = [
  '....#....',
  '.#.....#.',
  '...###...',
  '..#####..',
  '#.#####.#',
  '..#####..',
  '...###...',
  '.#.....#.',
  '....#....',
];
const MOON = [
  '...###..',
  '.###....',
  '.##.....',
  '##......',
  '##......',
  '.##.....',
  '.###....',
  '...###..',
];

const speeds = [
  { value: 0, label: 'Pausa' },
  { value: 1, label: '1×' },
  { value: 10, label: '10×' },
  { value: 60, label: '60×' },
];

function eta(train: Train, now: number) {
  const state = phase(train, now);
  const left = Math.max(1, Math.ceil(train.departure - now));
  if (state === 'closing') return 'cierre de puertas';
  // While it pulls in and its passengers get off, say where it comes from.
  if (now >= train.departure + ARRIVE && now < train.departure + ANNOUNCE) return `llegando de ${train.origin}`;
  if (state === 'boarding') return `embarque · ${left} min`;
  if (left < 60) return `en ${left} min`;
  return `en ${Math.floor(left / 60)} h ${String(left % 60).padStart(2, '0')}`;
}

function describe(train: Train, now: number) {
  const state = phase(train, now);
  const where = state === 'scheduled' ? 'vía por asignar' : `vía ${train.track}`;
  const late = train.delay ? `, con ${train.delay} minutos de retraso` : '';
  const doing = state === 'boarding' ? ', embarcando' : state === 'closing' ? ', cerrando puertas' : '';
  return `${clock(train.scheduled)}, ${serviceNames[train.service]} ${train.number} a ${train.destination}${late}, ${where}${doing}.`;
}

const PIN_KEY = 'trenes-mi-tren';
const AVERAGE_WALK = 3.5;

type Tone = 'calm' | 'go' | 'run' | 'gone';

// When to set off for your train: doors close two minutes before it leaves,
// and the walk to its platform takes what the map says it takes. Before the
// platform is announced, plan for an average walk.
function leaveBy(train: Train, now: number): { text: string; tone: Tone; walk: number } {
  const announced = phase(train, now) !== 'scheduled';
  const walk = announced ? walkMinutes(train.track) : AVERAGE_WALK;
  const margin = train.departure + CLOSE - walk - now;
  if (now >= train.departure + CLOSE) return { text: 'puertas cerradas', tone: 'gone', walk };
  if (margin > 3) return { text: `sal en ${Math.ceil(margin)} min`, tone: 'calm', walk };
  if (margin > 0) return { text: 'sal ya', tone: 'go', walk };
  return { text: 'corre', tone: 'run', walk };
}

function countdown(minutes: number) {
  const seconds = Math.max(0, Math.floor(minutes * 60));
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${m}:${ss}` : `${m}:${ss}`;
}

// Your train, pinned: a ticket that counts down and tells you when to go.
function Pass({ train, now }: { train: Train; now: number }) {
  const state = phase(train, now);
  const plan = leaveBy(train, now);
  const where = state === 'scheduled' ? 'vía por asignar' : `vía ${train.track}`;
  return (
    <span className="trenes-pass" data-tone={plan.tone}>
      <PixelText className="trenes-muted" text="mi tren · sale en" />
      <PixelText text={countdown(train.departure - now)} font="big" unit={4} />
      <PixelText className="trenes-pass-go" text={plan.text} unit={3} reveal />
      <PixelText className="trenes-muted" text={`¤ ${Math.ceil(plan.walk)} min a pie · ${where}`} />
    </span>
  );
}

function Card({ index, train, now, focused, pinned, onPick }: {
  index: number;
  train: Train;
  now: number;
  focused: boolean;
  pinned: boolean;
  onPick: (train: Train) => void;
}) {
  const state = phase(train, now);
  const live = state === 'boarding' || state === 'closing';
  const progress = live ? Math.min(1, (now - train.departure - BOARD) / -BOARD) : 0;
  return (
    <li data-id={train.id} data-pass={pinned || undefined} style={{ '--i': index } as CSSProperties}>
      <button
        type="button"
        className="trenes-card"
        data-state={state}
        data-pass={pinned || undefined}
        data-focused={focused || undefined}
        aria-pressed={pinned}
        aria-label={describe(train, now)}
        style={{ '--track': trackColor(train.track) } as CSSProperties}
        onClick={() => onPick(train)}
      >
        <span className="trenes-card-main">
        <span className="trenes-card-head">
          <span className="trenes-card-time">
            <PixelText text={clock(train.scheduled)} font="big" unit={3} reveal />
            <PixelText className="trenes-muted" text={eta(train, now)} />
          </span>
          <span className="trenes-card-track">
            <PixelText className="trenes-muted" text="vía" />
            <PixelText text={state === 'scheduled' ? '-' : String(train.track)} font="big" unit={3} reveal />
          </span>
        </span>
        <span className="trenes-card-service">
          <span className="trenes-tag"><PixelText text={train.service} /></span>
          <PixelText className="trenes-muted" text={train.number} />
          {train.delay > 0 && <PixelText className="trenes-late" text={`+${train.delay} · ${clock(train.departure)}`} />}
        </span>
        <span className="trenes-card-destination">
          <PixelText text={train.destination} unit={3} reveal />
        </span>
        <span className="trenes-card-stops">
          {(train.stops.length ? train.stops : ['Directo']).flatMap((stop, index) => [
            index > 0 && <PixelText key={`${stop}-dot`} className="trenes-muted" text="·" />,
            <PixelText key={stop} className="trenes-muted" text={stop} />,
          ])}
        </span>
        </span>
        {pinned && <Pass train={train} now={now} />}
        <span className="trenes-progress" aria-hidden="true" style={{ '--progress': progress } as CSSProperties} />
      </button>
    </li>
  );
}

export default function Trenes() {
  const reducedMotion = useReducedMotion();
  const sim = useRef({ real: performance.now(), minute: startMinute(), speed: 1 });
  const [speed, setSpeedState] = useState(reducedMotion ? 0 : 1);
  const [minute, setMinute] = useState(sim.current.minute);
  const [hovered, setHovered] = useState<Train | null>(null);
  // Your train survives a reload, for as long as it hasn't left.
  const [pinned, setPinned] = useState<Train | null>(() => {
    try {
      const id = localStorage.getItem(PIN_KEY);
      return around(sim.current.minute).find(train => train.id === id && train.departure > sim.current.minute) ?? null;
    } catch {
      return null;
    }
  });
  const [sound, setSoundState] = useState(false);
  const scheme = useScheme();

  // The page's colours are light-dark() pairs; this picks which half applies.
  useEffect(() => {
    document.documentElement.style.setProperty('--trenes-scheme', scheme);
    return () => { document.documentElement.style.removeProperty('--trenes-scheme'); };
  }, [scheme]);
  const [arriving, setArriving] = useState(true);
  const board = useRef<HTMLOListElement>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const mapBox = useRef<HTMLDivElement>(null);
  const map = useCrispScale(mapBox, MAP_W);
  const stripBox = useRef<HTMLDivElement>(null);
  // Narrow screens get the clock above the plan and a coarser day strip.
  const compact = MAP_W * map.scale / map.dpr < 560;
  const stripWidth = compact ? 200 : 400;
  const strip = useCrispScale(stripBox, stripWidth);

  const now = useCallback(() => {
    const { real, minute, speed } = sim.current;
    return minute + (performance.now() - real) / 60000 * speed;
  }, []);

  const retime = useCallback((minute: number, speed = sim.current.speed) => {
    sim.current = { real: performance.now(), minute, speed };
    setMinute(minute);
  }, []);

  const setSpeed = (value: number) => {
    retime(now(), value);
    setSpeedState(value);
  };

  useEffect(() => {
    const timeout = setTimeout(() => setArriving(false), 2400);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const title = document.title;
    document.title = 'Trenes';
    return () => { document.title = title; };
  }, []);

  useEffect(() => {
    if (reducedMotion) setSpeed(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // The board only needs a few updates a second; the canvases read the clock directly.
  useEffect(() => {
    const interval = setInterval(() => setMinute(now()), speed > 1 ? 250 : 1000);
    return () => clearInterval(interval);
  }, [now, speed]);

  const pin = pinned && pinned.departure > minute ? pinned : null;
  // Your ticket leads the board and takes two columns.
  const next = upcoming(minute, 5);
  const trains = pin ? [pin, ...next.filter(train => train.id !== pin.id).slice(0, 3)] : next;
  const live = trains.find(train => phase(train, minute) === 'boarding' || phase(train, minute) === 'closing');
  const focus = hovered ?? pin ?? live ?? trains.find(train => phase(train, minute) === 'announced') ?? null;
  const offTime = Math.abs(minute - realMinute()) > 1.5;

  // When a train leaves, the rest of the cards slide over to their new
  // places instead of jumping (FLIP: measure, invert, play).
  const ids = trains.map(train => train.id).join();
  const lastIds = useRef(ids);
  useLayoutEffect(() => {
    const changed = lastIds.current !== ids;
    lastIds.current = ids;
    const next = new Map<string, DOMRect>();
    board.current?.querySelectorAll<HTMLElement>('li[data-id]').forEach(item => {
      const rect = item.getBoundingClientRect();
      const id = item.dataset.id!;
      next.set(id, rect);
      const before = rects.current.get(id);
      if (!changed || reducedMotion || !before?.width || !rect.width) return;
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.22, .8, .25, 1)' });
    });
    rects.current = next;
  });

  const pick = (train: Train) => setPinned(current => current?.id === train.id ? null : train);

  useEffect(() => {
    try {
      if (pin) localStorage.setItem(PIN_KEY, pin.id);
      else localStorage.removeItem(PIN_KEY);
    } catch {
      // Private windows may refuse storage; the pin then lasts for this visit.
    }
  }, [pin]);

  useEffect(() => setSound(sound), [sound]);

  // Station announcements: a chime as boarding opens (your own train gets
  // its own tune) and a nudge when it's time to set off. Jumps through time
  // stay silent.
  const heard = useRef({ minute, phases: new Map<string, string>(), tone: '' });
  useEffect(() => {
    const before = heard.current;
    const jumped = Math.abs(minute - before.minute) > 3;
    const phases = new Map<string, string>();
    for (const train of trains) {
      const state = phase(train, minute);
      phases.set(train.id, state);
      if (!jumped && state === 'boarding' && before.phases.has(train.id) && before.phases.get(train.id) !== 'boarding') chime(train.id === pin?.id);
    }
    const tone = pin ? leaveBy(pin, minute).tone : '';
    if (!jumped && tone === 'go' && before.tone === 'calm') nudge();
    heard.current = { minute, phases, tone };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [role="slider"]')) return;
      if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        setSpeed(sim.current.speed ? 0 : 1);
      } else if (event.key === 'Escape') setPinned(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="minimal-portfolio-page trenes-page" tabIndex={-1}>
      <div className="minimal-portfolio-shell trenes-shell">
        <header className="trenes-header">
          <a className="minimal-basic-link minimal-reveal-line" href="/">Index</a>
          <h1 className="minimal-reveal-line">Trenes</h1>
          <p className="minimal-reveal-line">Salidas de una estación imaginaria con ocho vías, en pixel art.</p>
        </header>

        <section className="trenes-station" aria-label="Estación">
          <div className="trenes-clock minimal-reveal-line" hidden={!compact}>
            <span className="trenes-clock-now" role="img" aria-label={`Son las ${clock(minute)}, ${dateLabel(minute)}`}>
              <PixelText text={clock(minute)} font="big" unit={4} />
              <PixelText className="trenes-muted" text={offTime ? 'hora simulada' : 'hora actual'} />
            </span>
            <PixelText className="trenes-date" text={dateLabel(minute)} unit={2} />
          </div>

          <div className="trenes-stage trenes-enter" ref={mapBox}>
            <StationMap
              now={now}
              showClock={!compact}
              simulated={offTime}
              focus={focus}
              reducedMotion={reducedMotion}
              onHover={setHovered}
              onPick={pick}
              onSignal={click}
              scale={map.scale}
              dpr={map.dpr}
            />
          </div>

          <ol ref={board} data-has-pass={pin ? '' : undefined} className="trenes-board" style={{ '--tick': speed > 1 ? '250ms' : '1s' } as CSSProperties} data-arriving={arriving || undefined} aria-label="Próximas salidas">
            {trains.map((train, index) => (
              <Card
                index={index}
                key={train.id}
                train={train}
                now={minute}
                focused={focus?.id === train.id}
                pinned={pin?.id === train.id}
                onPick={pick}
              />
            ))}
          </ol>
        </section>

        <div className="trenes-controls minimal-reveal-line">
          <div className="trenes-speeds" role="radiogroup" aria-label="Velocidad del reloj">
            {speeds.map(option => (
              <button key={option.value} type="button" role="radio" aria-checked={speed === option.value} onClick={() => setSpeed(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="trenes-timeline" ref={stripBox}>
            <DayStrip width={stripWidth} reducedMotion={reducedMotion} now={now} minute={minute} onSeek={retime} scale={strip.scale} dpr={strip.dpr} />
          </div>
          <button type="button" className="trenes-icon trenes-theme" aria-label={scheme === 'dark' ? 'Ver en claro' : 'Ver en oscuro'}
            title={scheme === 'dark' ? 'Claro' : 'Oscuro'} onClick={() => setScheme(scheme === 'dark' ? 'light' : 'dark')}>
            <PixelSprite rows={scheme === 'dark' ? MOON : SUN} unit={2} />
          </button>
          <button type="button" className="trenes-sound trenes-icon" aria-pressed={sound} aria-label="Sonido de la estación" title="Sonido"
            onClick={() => setSoundState(value => !value)}>
            <PixelSprite rows={sound ? SPEAKER_ON : SPEAKER_OFF} unit={2} />
          </button>
          <button type="button" className="trenes-now" disabled={!offTime} onClick={() => retime(realMinute())}>Ahora</button>
        </div>
        <p className="trenes-hint minimal-reveal-line">Clic en una salida para hacerla tu tren y ver el camino a su vía · arrastra el día para viajar en el tiempo · espacio pausa</p>
      </div>
    </main>
  );
}
