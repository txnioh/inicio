import type { BoardKind, Look, SkateStats } from './skate';
import './skate.css';

const kmh = (speed: number) => (speed * 3.6).toFixed(1).replace('.', ',');

/** During the run: speed and time, nothing else. */
export default function SkateHud({ stats }: { stats: SkateStats }) {
  return <section className="skate-hud" aria-label="Skate" aria-live="off">
    <span className="skate-speed"><b>{kmh(stats.speed)}</b> km/h</span>
    <span className="skate-time">{stats.time.toFixed(1).replace('.', ',')} s{stats.pilot ? ' · piloto' : ''}</span>
  </section>;
}

const boardOptions: { kind: BoardKind; name: string; note: string }[] = [
  { kind: 'skate', name: 'Skate', note: 'Corta y ágil: gira antes.' },
  { kind: 'longboard', name: 'Longboard', note: 'Larga y baja: más estable.' },
];

const lookOptions: { look: Look; name: string; image: string }[] = [
  { look: 'scenic', name: 'Costa', image: '/jumper/skate-costa.webp' },
  { look: 'minimal', name: 'Minimal', image: '/jumper/skate-minimal.webp' },
];

/** Board outline seen from above, for the picker. */
function Outline({ kind }: { kind: BoardKind }) {
  return kind === 'skate'
    ? <svg width="96" height="34" viewBox="0 0 96 34" aria-hidden="true"><rect x="2" y="3" width="92" height="28" rx="14" /><circle cx="27" cy="9" r="1.6" /><circle cx="27" cy="25" r="1.6" /><circle cx="69" cy="9" r="1.6" /><circle cx="69" cy="25" r="1.6" /></svg>
    : <svg width="132" height="34" viewBox="0 0 132 34" aria-hidden="true"><path d="M20 3H112A18 14 0 0 1 112 31H20A18 14 0 0 1 20 3Z" /><path className="skate-cut" d="M34 3q8 5 16 0M34 31q8-5 16 0M82 3q8 5 16 0M82 31q8-5 16 0" /></svg>;
}

/** Centre panel before the run: pick a board, then go or let the pilot ride. */
export function SkateStart({ stats, board, onBoard, look, onLook, onStart, onPilot }: { stats: SkateStats; board: BoardKind; onBoard: (kind: BoardKind) => void; look: Look; onLook: (look: Look) => void; onStart: () => void; onPilot: () => void }) {
  return <section className="skate-start" aria-label="Empezar la bajada">
    <h2>Bajada</h2>
    <div className="skate-boards" role="radiogroup" aria-label="Tabla">
      {boardOptions.map(option => <button key={option.kind} role="radio" aria-checked={board === option.kind} onClick={() => onBoard(option.kind)}>
        <Outline kind={option.kind} /><strong>{option.name}</strong><span>{option.note}</span>
      </button>)}
    </div>
    {/* The coast road's two maps side by side: the golden-hour coast and the minimal one. */}
    {board === 'longboard' ? <div className="skate-maps" role="radiogroup" aria-label="Mapa">
      {lookOptions.map(option => <button key={option.look} role="radio" aria-checked={look === option.look} onClick={() => onLook(option.look)}>
        <img src={option.image} alt="" width="640" height="400" /><strong>{option.name}</strong>
      </button>)}
    </div> : null}
    <div className="skate-go">
      <button className="skate-primary" onClick={onStart} autoFocus>Empezar <kbd>Enter</kbd></button>
      <button className="skate-secondary" onClick={onPilot} aria-pressed={stats.pilot}>{stats.pilot ? 'Piloto activado' : 'Piloto automático'} <kbd>P</kbd></button>
    </div>
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
