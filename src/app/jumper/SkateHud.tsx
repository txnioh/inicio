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

/** The runs, each with its board and look (the playground's signs pick one). */
export type SkateMap = 'calle' | 'costa' | 'minimal';
export const skateMaps: { id: SkateMap; name: string; board: BoardKind; look: Look }[] = [
  { id: 'calle', name: 'Calle', board: 'skate', look: 'minimal' },
  { id: 'costa', name: 'Costa', board: 'longboard', look: 'scenic' },
  { id: 'minimal', name: 'Costa minimal', board: 'longboard', look: 'minimal' },
];

/** Centre panel at the finish. */
export function SkateFinish({ stats, onAgain }: { stats: SkateStats; onAgain: () => void }) {
  return <section className="skate-start skate-finish" aria-live="polite">
    <h2>{stats.time.toFixed(1).replace('.', ',')} s</h2>
    <p>{stats.cones ? `${stats.cones} ${stats.cones === 1 ? 'cono derribado' : 'conos derribados'}` : 'Sin tocar un cono'} · máx {kmh(stats.top)} km/h</p>
    <div className="skate-go"><button className="skate-primary" onClick={onAgain}>Otra vez <kbd>R</kbd></button></div>
  </section>;
}
