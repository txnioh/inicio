import { useEffect } from 'react';
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

/** The runs, each with its board and look: picked on entering the page. */
export type SkateMap = 'calle' | 'costa' | 'minimal';
export const skateMaps: { id: SkateMap; name: string; note: string; board: BoardKind; look: Look; image: string }[] = [
  { id: 'calle', name: 'Calle', note: 'Skate · conos y chicanes', board: 'skate', look: 'minimal', image: '/jumper/skate-calle.webp' },
  { id: 'costa', name: 'Costa', note: 'Longboard · carretera sobre el mar', board: 'longboard', look: 'scenic', image: '/jumper/skate-costa.webp' },
  { id: 'minimal', name: 'Costa minimal', note: 'Longboard · la costa en blanco', board: 'longboard', look: 'minimal', image: '/jumper/skate-minimal.webp' },
];

/** On entering: the three runs, large, side by side. A click (or 1–3) picks one and loads it. */
export function SkateMaps({ onPick }: { onPick: (map: SkateMap) => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { const map = skateMaps[Number(event.key) - 1]; if (map && !event.repeat) onPick(map.id); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onPick]);
  return <section className="skate-maps" aria-label="Elige la bajada">
    {skateMaps.map((map, i) => <button key={map.id} onClick={() => onPick(map.id)}>
      <img src={map.image} alt="" width="640" height="400" />
      <span><strong>{map.name}</strong><small>{map.note}</small></span><kbd>{i + 1}</kbd>
    </button>)}
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
