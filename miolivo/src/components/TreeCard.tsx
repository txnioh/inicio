import type { ReactNode } from 'react';
import { ANOMALY_INFO, primaryAnomaly, type Twin } from '../model/analyze.ts';
import { costOfInaction, euros } from '../model/economics.ts';
import type { Feedback } from '../model/feedback.ts';
import { CAMPAIGNS, FORECAST } from '../model/types.ts';
import { coordinates, dec, eur, int, signedPercent } from '../format.ts';
import { createTask, focusOn, openTree, select, setState, TASK_LABEL, useStore } from '../store.ts';
import Sparkline from './Sparkline.tsx';

const RISK = ['bajo', 'medio', 'alto'];
const stressLevel = (cwsi: number) => (cwsi < 0.35 ? 'bajo' : cwsi < 0.55 ? 'medio' : 'alto');

/** Simplified allometry: dry above-ground biomass from crown volume, 47 % of it carbon. */
const carbonKg = (volume: number) => 25 * volume ** 0.9 * 0.47;

export default function TreeCard({ twin, feedback, lossKg }: { twin: Twin; feedback: Feedback; lossKg: Float64Array }) {
  const index = useStore(s => s.tree);
  const campaign = useStore(s => s.campaign);
  const assumptions = useStore(s => s.assumptions);
  const selected = useStore(s => (index === null ? false : s.selection.includes(index)));

  if (index === null) {
    return (
      <div className="empty">
        <p><strong>Pulsa un olivo en el mapa</strong> para ver su ficha: geometría, vigor, estrés, cosechas y lo que conviene hacer.</p>
        <p>Cada olivo tiene una identidad permanente y un historial por campaña.</p>
      </div>
    );
  }

  const { farm } = twin;
  const tree = farm.trees[index];
  const plot = farm.plots[tree.plot];
  const analysis = twin.campaigns[campaign];
  const snap = tree.snapshots[campaign];
  const status = feedback.status[index];
  const anomalies = feedback.anomalies[index];
  const primary = primaryAnomaly(anomalies);
  const forecast = twin.campaigns[FORECAST];
  const [low, high] = costOfInaction(lossKg[index], anomalies, assumptions);
  const lastPruning = Math.max(...tree.pruneYears.filter(y => y <= CAMPAIGNS[campaign]));
  const previousHarvest = campaign === 0 ? null : tree.snapshots[Math.min(campaign, FORECAST) - 1 as 0 | 1].harvestKg;
  const history = feedback.history.get(index) ?? [];
  const carbon = carbonKg(snap.volume);

  const rows: [string, ReactNode][] = [
    ['Posición', coordinates(tree.lat, tree.lon)],
    ['Parcela', <>{plot.id} <span className="muted">· SIGPAC {plot.sigpac}</span></>],
    ['Variedad', `${tree.variety} · ${plot.system} · ${plot.irrigation} · plantado hacia ${tree.plantedYear}`],
    ['Volumen de copa', `${dec(snap.volume, 1)} m³ · Ø ${dec(snap.canopyDiameter, 1)} m · ${dec(snap.height, 1)} m de altura`],
    ['Evolución de copa', campaign === 0 ? 'Campaña de referencia' : `${signedPercent(analysis.canopyChange[index])} de área desde 2024 (entorno ${signedPercent(analysis.reference.change[index])})`],
    ['Vigor', `${int(snap.vigor)}/100 · entorno ${int(analysis.reference.vigor[index])}`],
    ['Estrés hídrico', `${stressLevel(snap.waterStress)} · CWSI ${dec(snap.waterStress, 2)} (entorno ${dec(analysis.reference.stress[index], 2)})`],
    ['Cosecha anterior', previousHarvest === null ? '—' : `${int(previousHarvest)} kg (${CAMPAIGNS[campaign - 1]})`],
    [campaign === FORECAST ? 'Cosecha estimada' : 'Cosecha pesada', campaign === FORECAST ? `${int(analysis.kgLow[index])}–${int(analysis.kgHigh[index])} kg` : `${int(analysis.kg[index])} kg`],
    ['Última poda', `${plot.pruneMonth} ${lastPruning}`],
    ['Carbono en biomasa aérea', `≈ ${dec(carbon / 1000, 2)} t C · ${dec((carbon * 3.67) / 1000, 1)} t CO₂e`],
    ['Riesgo', RISK[status]],
  ];

  return (
    <article className="tree-card" aria-labelledby="tree-title">
      <header>
        <div>
          <h2 id="tree-title">Olivo {tree.id}</h2>
          <span className={`badge is-${status}`}>{['Normal', 'Revisar', 'Actuar'][status]}</span>
        </div>
        <button type="button" className="icon-button" aria-label="Cerrar ficha" onClick={() => openTree(null)}>×</button>
      </header>

      {primary && (
        <section className={`diagnosis is-${status}`}>
          <h3>{ANOMALY_INFO[primary.type].label[0].toUpperCase() + ANOMALY_INFO[primary.type].label.slice(1)}</h3>
          <ul>{anomalies!.map(a => <li key={a.type}>{a.evidence}</li>)}</ul>
          {lossKg[index] > 0 && <p>{campaign === FORECAST ? 'Producción prevista' : 'Cosecha'} frente a su potencial: {signedPercent(-lossKg[index] / analysis.potentialKg[index])} · {eur(euros(lossKg[index], assumptions))} esta campaña</p>}
          <p className="recommendation"><strong>Recomendación:</strong> {ANOMALY_INFO[primary.type].action}</p>
          {high > 0 && <p className="cost">Coste estimado de no actuar: <strong>{int(low)}–{int(high)} €</strong>/campaña</p>}
        </section>
      )}

      <div className="trends">
        <figure><figcaption>Copa</figcaption><Sparkline label="Volumen de copa por campaña" current={campaign} values={tree.snapshots.map(s => s.volume)} /></figure>
        <figure><figcaption>Vigor</figcaption><Sparkline label="Vigor por campaña" current={campaign} values={tree.snapshots.map(s => s.vigor)} /></figure>
        <figure><figcaption>Estrés</figcaption><Sparkline label="Estrés hídrico por campaña" current={campaign} values={tree.snapshots.map(s => s.waterStress)} /></figure>
        <figure><figcaption>Cosecha</figcaption><Sparkline label="Cosecha por campaña; 2026 es previsión" current={campaign} values={[twin.campaigns[0].kg[index], twin.campaigns[1].kg[index], forecast.kg[index]]} forecast={[forecast.kgLow[index], forecast.kgHigh[index]]} /></figure>
      </div>

      <dl className="facts">
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>

      <section className="history">
        <h3>Historial</h3>
        <ul>
          {history.map(({ task, outcome }) => (
            <li key={task.id}>
              <span>{new Date(task.completedAt ?? task.createdAt).toLocaleDateString('es-ES')}</span>
              {TASK_LABEL[task.type]} · {outcome === 'confirmado' ? 'problema confirmado en campo' : 'sin problema en campo (falso positivo)'}
            </li>
          ))}
          {tree.pruneYears.slice().reverse().map(year => <li key={year}><span>{plot.pruneMonth} {year}</span>Poda</li>)}
          {plot.treatments.slice().reverse().map(t => <li key={t.date + t.label}><span>{t.date}</span>{t.label}</li>)}
        </ul>
      </section>

      <div className="actions">
        <button type="button" className="button is-primary" onClick={() => createTask(primary ? ANOMALY_INFO[primary.type].task : 'inspeccion', [index], primary?.type)}>
          Crear tarea para este olivo
        </button>
        <button type="button" className="button" onClick={() => select([index], 'toggle')}>
          {selected ? 'Quitar de la selección' : 'Añadir a la selección'}
        </button>
        <button type="button" className="button is-quiet" onClick={() => { focusOn([index], 25); setState({ tree: index }); }}>Centrar</button>
      </div>
    </article>
  );
}
