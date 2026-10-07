import { stance, type SkateStats } from './skate';
import './skate.css';

const kmh = (speed: number) => (speed * 3.6).toFixed(1).replace('.', ',');

export default function SkateHud({ stats, onRelease, onPilot }: { stats: SkateStats; onRelease: () => void; onPilot: () => void }) {
  return <section className="skate-hud" aria-label="Skate">
    <div className="skate-speed" aria-live="off"><span>{kmh(stats.speed)}</span> km/h<small>máx {kmh(stats.top)} · {stats.time.toFixed(1).replace('.', ',')} s{stats.cones ? ` · ${stats.cones} ${stats.cones === 1 ? 'cono' : 'conos'}` : ''}</small></div>
    <Weight stats={stats} />
    <ol className="skate-feed" aria-live="polite">{stats.feed.map(item => <li key={item.id}>{item.text}</li>)}</ol>
    <div className="skate-actions">
      <button onClick={onRelease} disabled={stats.released} title="Enter">{stats.released ? 'Suelto' : 'Soltar'}</button>
      <button onClick={onPilot} aria-pressed={stats.pilot} title="P">Piloto{stats.pilot ? ' · on' : ''}</button>
    </div>
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
