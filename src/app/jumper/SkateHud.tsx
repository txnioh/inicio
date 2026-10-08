import type { BoardKind, Look, SkateStats } from './skate';
import type { Strings } from './i18n';
import './skate.css';

const kmh = (speed: number) => (speed * 3.6).toFixed(1);

/** During the run: speed and time, nothing else. */
export default function SkateHud({ stats, t }: { stats: SkateStats; t: Strings }) {
  return <section className="skate-hud" aria-label="Skate" aria-live="off">
    <span className="skate-speed"><b>{kmh(stats.speed)}</b> km/h</span>
    <span className="skate-time">{stats.time.toFixed(1)} s{stats.pilot ? ` · ${t.pilotTag}` : ''}</span>
  </section>;
}

/** The runs, each with its board and look (the playground's signs pick one; names in i18n.ts). */
export type SkateMap = 'calle' | 'costa' | 'minimal';
export const skateMaps: { id: SkateMap; board: BoardKind; look: Look }[] = [
  { id: 'calle', board: 'skate', look: 'minimal' },
  { id: 'costa', board: 'longboard', look: 'scenic' },
  { id: 'minimal', board: 'longboard', look: 'minimal' },
];

/** Centre panel at the finish. */
export function SkateFinish({ stats, t, onAgain }: { stats: SkateStats; t: Strings; onAgain: () => void }) {
  return <section className="skate-start skate-finish" aria-live="polite">
    <h2>{stats.time.toFixed(1)} s</h2>
    <p>{stats.cones ? t.cones(stats.cones) : t.clean} · {t.top_} {kmh(stats.top)} km/h</p>
    <div className="skate-go"><button className="skate-primary" onClick={onAgain}>{t.again} <kbd>R</kbd></button></div>
  </section>;
}
