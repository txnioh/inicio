import { stance, type BoardKind, type SkateStats } from './skate';
import './skate.css';

const kmh = (speed: number) => (speed * 3.6).toFixed(1).replace('.', ',');

export default function SkateHud({ stats }: { stats: SkateStats }) {
  return <section className="skate-hud" aria-label="Skate">
    <div className="skate-speed" aria-live="off"><span>{kmh(stats.speed)}</span> km/h<small>máx {kmh(stats.top)} · {stats.time.toFixed(1).replace('.', ',')} s{stats.cones ? ` · ${stats.cones} ${stats.cones === 1 ? 'cono' : 'conos'}` : ''}{stats.pilot ? ' · piloto' : ''}</small></div>
    <Weight stats={stats} />
    <ol className="skate-feed" aria-live="polite">{stats.feed.map(item => <li key={item.id}>{item.text}</li>)}</ol>
  </section>;
}

const boardOptions: { kind: BoardKind; name: string; note: string }[] = [
  { kind: 'skate', name: 'Skate', note: 'Corta y ágil: gira antes.' },
  { kind: 'longboard', name: 'Longboard', note: 'Larga y baja: más estable.' },
];

/** Board outline seen from above, for the picker. */
function Outline({ kind }: { kind: BoardKind }) {
  return kind === 'skate'
    ? <svg width="96" height="34" viewBox="0 0 96 34" aria-hidden="true"><rect x="2" y="3" width="92" height="28" rx="14" /><circle cx="27" cy="9" r="1.6" /><circle cx="27" cy="25" r="1.6" /><circle cx="69" cy="9" r="1.6" /><circle cx="69" cy="25" r="1.6" /></svg>
    : <svg width="132" height="34" viewBox="0 0 132 34" aria-hidden="true"><path d="M20 3H112A18 14 0 0 1 112 31H20A18 14 0 0 1 20 3Z" /><path className="skate-cut" d="M34 3q8 5 16 0M34 31q8-5 16 0M82 3q8 5 16 0M82 31q8-5 16 0" /></svg>;
}

/** Centre panel before the run: pick a board, then go or let the pilot ride. */
export function SkateStart({ stats, board, onBoard, onStart, onPilot }: { stats: SkateStats; board: BoardKind; onBoard: (kind: BoardKind) => void; onStart: () => void; onPilot: () => void }) {
  return <section className="skate-start" aria-label="Empezar la bajada">
    <h2>Bajada</h2>
    <p>Jumper no empuja ni salta: solo mueve su peso sobre la tabla para girar.</p>
    <div className="skate-boards" role="radiogroup" aria-label="Tabla">
      {boardOptions.map(option => <button key={option.kind} role="radio" aria-checked={board === option.kind} onClick={() => onBoard(option.kind)}>
        <Outline kind={option.kind} /><strong>{option.name}</strong><span>{option.note}</span>
      </button>)}
    </div>
    <div className="skate-go">
      <button className="skate-primary" onClick={onStart} autoFocus>Empezar <kbd>Enter</kbd></button>
      <button className="skate-secondary" onClick={onPilot} aria-pressed={stats.pilot}>{stats.pilot ? 'Piloto activado' : 'Piloto automático'} <kbd>P</kbd></button>
    </div>
    <p className="skate-keys"><kbd>←</kbd><kbd>→</kbd> girar · <kbd>W</kbd><kbd>S</kbd> puntas / talones · <kbd>R</kbd> reiniciar</p>
    <p className="skate-touch">Joystick a los lados para girar, arriba y abajo para puntas y talones.</p>
  </section>;
}

/** Centre panel at the finish. */
export function SkateFinish({ stats, onAgain }: { stats: SkateStats; onAgain: () => void }) {
  return <section className="skate-start skate-finish" aria-live="polite">
    <h2>{stats.time.toFixed(1).replace('.', ',')} s</h2>
    <p>{stats.cones ? `${stats.cones} ${stats.cones === 1 ? 'cono derribado' : 'conos derribados'}` : 'Sin tocar un cono'} · máx {kmh(stats.top)} km/h</p>
    <div className="skate-go"><button className="skate-primary" onClick={onAgain}>Otra vez <kbd>R</kbd></button></div>
  </section>;
}

// Top view of the deck: nose to the right, toes up. The ring is where the
// rider asked the feet to be, the dot where they are, and the bar the body lean.
function Weight({ stats }: { stats: SkateStats }) {
  const x = (along: number) => 44 + along / stance.along * 18, y = (across: number) => 14 + across / stance.heels * 9;
  const clampX = (v: number) => Math.max(6, Math.min(82, v)), clampY = (v: number) => Math.max(3, Math.min(25, v));
  return <svg className="skate-weight" width="88" height="28" viewBox="0 0 88 28" role="img" aria-label="Peso sobre la tabla">
    <rect x="1" y="1" width="86" height="26" rx="13" />
    <line x1={x(-stance.along)} x2={x(stance.along)} y1="14" y2="14" />
    <line x1="44" x2="44" y1={y(-stance.toes)} y2={y(stance.heels)} />
    <circle className="skate-weight-target" cx={clampX(x(stats.target[1]))} cy={clampY(y(stats.target[0]))} r="4" />
    <line className="skate-weight-lean" x1="44" x2="44" y1="14" y2={14 + stats.lean * 11} />
    <circle className="skate-weight-feet" cx={clampX(x(stats.weight[1]))} cy={clampY(y(stats.weight[0]))} r="2.4" />
  </svg>;
}
