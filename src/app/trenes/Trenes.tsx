import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import DayStrip from './DayStrip';
import { PixelSprite } from '../components/PixelSprite';
import { cursors } from './cursors';
import PixelText, { FlipText } from './PixelText';
import SevenSeg from './SevenSeg';
import { ANNOUNCE, ARRIVE, BOARD, around, clock, dateLabel, madridOffset, phase, serviceNames, type Train } from './schedule';
import { chime, click, setSound } from './sound';
import { setScheme, useScheme } from './theme';
import StationMap, { trackColor, useCrispScale, W as MAP_W } from './StationMap';
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

// `?time=19:30` opens the station at that time today, to share a moment
// (`?hora=` still works for older links).
const startMinute = () => {
  const now = realMinute();
  const match = /^(\d{1,2}):(\d{2})$/.exec((new URLSearchParams(location.search).get('time') ?? new URLSearchParams(location.search).get('hora')) ?? '');
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

// The clock only ever runs at one speed; the station is a time-lapse.
const SPEED = 60;

const PLAY = ['#......', '###....', '#####..', '#######', '#####..', '###....', '#......'];
const PAUSE = ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'];

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

function eta(train: Train, now: number) {
  const state = phase(train, now);
  const left = Math.max(1, Math.ceil(train.departure - now));
  if (state === 'closing') return 'doors closing';
  // While it pulls in and empties, say where it comes from.
  if (now >= train.departure + ARRIVE && now < train.departure + ANNOUNCE) return `arriving from ${train.origin}`;
  if (state === 'boarding') return `boarding · ${left} min`;
  if (left < 60) return `in ${left} min`;
  return `in ${Math.floor(left / 60)} h ${String(left % 60).padStart(2, '0')}`;
}

function describe(train: Train, now: number) {
  const state = phase(train, now);
  const where = state === 'scheduled' ? 'platform to be announced' : `platform ${train.track}`;
  const late = train.delay ? `, ${train.delay} minutes late` : '';
  const doing = state === 'boarding' ? ', boarding' : state === 'closing' ? ', doors closing' : '';
  return `${clock(train.scheduled)}, ${serviceNames[train.service]} ${train.number} to ${train.destination}${late}, ${where}${doing}.`;
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
    <li data-id={train.id} style={{ '--i': index } as CSSProperties}>
      <button
        type="button"
        className="trenes-card"
        data-state={state}
        data-focused={focused || undefined}
        aria-pressed={pinned}
        aria-label={describe(train, now)}
        style={{ '--track': trackColor(train.track) } as CSSProperties}
        onClick={() => onPick(train)}
      >
        <span className="trenes-card-main">
        {/* Where it goes leads; when and from where follow, smaller. Stops
            only show for your train and the ones boarding now. */}
        <span className="trenes-card-head">
          <span className="trenes-card-time">
            {/* A late train keeps its place: the timetabled time is struck
                through and the expected one sits beside it. */}
            <span className="trenes-card-clock" data-late={train.delay > 0 || undefined}>
              <PixelText className="trenes-card-scheduled" text={clock(train.scheduled)} font="big" unit={2} reveal />
              {train.delay > 0 && <PixelText className="trenes-late" text={clock(train.departure)} font="big" unit={2} reveal />}
            </span>
            <FlipText className="trenes-muted" text={eta(train, now)} />
          </span>
          <span className="trenes-card-track">
            <PixelText className="trenes-muted" text="plat" />
            <FlipText text={state === 'scheduled' ? '-' : String(train.track)} font="big" unit={3} />
          </span>
        </span>
        <span className="trenes-card-destination">
          <PixelText text={train.destination} unit={4} reveal />
        </span>
        <span className="trenes-card-service">
          <span className="trenes-tag"><PixelText text={train.service} /></span>
          <PixelText className="trenes-muted" text={train.number} />
          {train.delay > 0 && <PixelText className="trenes-late" text={`+${train.delay} min`} />}
        </span>
        {(pinned || live) && (
          <span className="trenes-card-stops">
            {(train.stops.length ? train.stops : ['Non-stop']).flatMap((stop, index) => [
              index > 0 && <PixelText key={`${stop}-dot`} className="trenes-muted" text="·" />,
              <PixelText key={stop} className="trenes-muted" text={stop} />,
            ])}
          </span>
        )}
        </span>
        <span className="trenes-progress" aria-hidden="true" style={{ '--progress': progress } as CSSProperties} />
      </button>
    </li>
  );
}

export default function Trenes() {
  const reducedMotion = useReducedMotion();
  const sim = useRef({ real: performance.now(), minute: startMinute(), speed: reducedMotion ? 0 : SPEED });
  const [playing, setPlayingState] = useState(!reducedMotion);
  const [minute, setMinute] = useState(sim.current.minute);
  const [hovered, setHovered] = useState<Train | null>(null);
  // The card you clicked: its train is the one the plan shows the way to.
  const [pinned, setPinned] = useState<Train | null>(null);
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

  const setPlaying = (value: boolean) => {
    retime(now(), value ? SPEED : 0);
    setPlayingState(value);
  };

  useEffect(() => {
    const timeout = setTimeout(() => setArriving(false), 2400);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const title = document.title;
    document.title = 'Trains';
    return () => { document.title = title; };
  }, []);

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // The board only needs a few updates a second; the canvases read the clock directly.
  useEffect(() => {
    const interval = setInterval(() => setMinute(now()), 250);
    return () => clearInterval(interval);
  }, [now]);

  const pin = pinned && pinned.departure > minute ? pinned : null;
  // Like a real board, in timetable order: a late train holds its place
  // (and stays on top while it waits) instead of jumping behind later ones.
  const trains = around(minute).filter(train => train.departure > minute).sort((a, b) => a.scheduled - b.scheduled).slice(0, 5);
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

  useEffect(() => setSound(sound), [sound]);

  // Station announcements: a chime as boarding opens, with its own tune for
  // the train you picked. Jumps through time stay silent.
  const heard = useRef({ minute, phases: new Map<string, string>() });
  useEffect(() => {
    const before = heard.current;
    const jumped = Math.abs(minute - before.minute) > 3;
    const phases = new Map<string, string>();
    for (const train of trains) {
      const state = phase(train, minute);
      phases.set(train.id, state);
      if (!jumped && state === 'boarding' && before.phases.has(train.id) && before.phases.get(train.id) !== 'boarding') chime(train.id === pin?.id);
    }
    heard.current = { minute, phases };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [role="slider"]')) return;
      if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        setPlaying(!sim.current.speed);
      } else if (event.key === 'Escape') setPinned(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="minimal-portfolio-page trenes-page" tabIndex={-1} style={cursors as CSSProperties}>
      <div className="minimal-portfolio-shell trenes-shell">
        <header className="trenes-header">
          <a className="minimal-basic-link minimal-reveal-line" href="/">Index</a>
          <h1 className="minimal-reveal-line">Trains</h1>
          <p className="minimal-reveal-line">Departures from an imaginary eight-platform station, in pixel art.</p>
        </header>

        <section className="trenes-station" aria-label="Station">
          <div className="trenes-clock minimal-reveal-line" hidden={!compact}>
            <span className="trenes-clock-now" role="img" aria-label={`It's ${clock(minute)}, ${dateLabel(minute)}`}>
              <SevenSeg text={clock(minute)} unit={4} />
              <PixelText className="trenes-muted" text={playing ? `time ×${SPEED}` : 'paused'} />
            </span>
            <PixelText className="trenes-date" text={dateLabel(minute)} unit={2} />
          </div>

          <div className="trenes-stage trenes-enter" ref={mapBox}>
            <StationMap
              now={now}
              showClock={!compact}
              label={playing ? `×${SPEED}` : 'paused'}
              focus={focus}
              reducedMotion={reducedMotion}
              onHover={setHovered}
              onPick={pick}
              onSignal={click}
              scale={map.scale}
              dpr={map.dpr}
            />
          </div>

          <ol ref={board} className="trenes-board" style={{ '--tick': '250ms' } as CSSProperties} data-arriving={arriving || undefined} aria-label="Next departures">
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
          <button type="button" className="trenes-icon trenes-play" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}
            onClick={() => setPlaying(!playing)}>
            <PixelSprite rows={playing ? PAUSE : PLAY} unit={2} />
          </button>
          <div className="trenes-timeline" ref={stripBox}>
            <DayStrip width={stripWidth} reducedMotion={reducedMotion} now={now} minute={minute} onSeek={retime} scale={strip.scale} dpr={strip.dpr} />
          </div>
          <button type="button" className="trenes-icon trenes-theme" aria-label={scheme === 'dark' ? 'Light mode' : 'Dark mode'}
            title={scheme === 'dark' ? 'Light' : 'Dark'} onClick={() => setScheme(scheme === 'dark' ? 'light' : 'dark')}>
            <PixelSprite rows={scheme === 'dark' ? MOON : SUN} unit={2} />
          </button>
          <button type="button" className="trenes-sound trenes-icon" aria-pressed={sound} aria-label="Station sounds" title="Sound"
            onClick={() => setSoundState(value => !value)}>
            <PixelSprite rows={sound ? SPEAKER_ON : SPEAKER_OFF} unit={2} />
          </button>
          <button type="button" className="trenes-now" disabled={!offTime} aria-label="Back to now" title="Back to now" onClick={() => retime(realMinute())}>
            <PixelText text="now" />
          </button>
        </div>
        <p className="trenes-hint minimal-reveal-line">Click a departure to see the way to its platform · drag the day to travel in time · space to pause</p>
      </div>
    </main>
  );
}
