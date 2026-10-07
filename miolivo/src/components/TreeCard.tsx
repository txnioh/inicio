import { Crosshair, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
      <div className="grid gap-1 py-8 text-center text-muted-foreground">
        <p className="font-medium text-foreground">Ningún olivo abierto</p>
        <p>Pulsa un olivo en el mapa para ver su ficha.</p>
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
    ['Parcela', <>{plot.id} <span className="text-muted-foreground">· SIGPAC {plot.sigpac}</span></>],
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

  const STATUS_TEXT = ['text-ok', 'text-warn', 'text-bad'];

  return (
    <article className="grid gap-6" aria-labelledby="tree-title">
      <header className="flex items-start justify-between gap-2">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <h2 id="tree-title" className="text-lg font-semibold tracking-tight">Olivo {tree.id}</h2>
            <Badge variant="outline" className={STATUS_TEXT[status]}>
              <i className={`size-1.5 rounded-full bg-current`} aria-hidden="true" />{['Normal', 'Revisar', 'Actuar'][status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{tree.variety} · Parcela {plot.id} · {dec(snap.volume, 1)} m³ de copa</p>
        </div>
        <div className="flex">
          <Button variant="ghost" size="icon-sm" aria-label="Centrar en el mapa" title="Centrar" onClick={() => { focusOn([index], 25); setState({ tree: index }); }}><Crosshair /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Cerrar ficha" onClick={() => openTree(null)}><X /></Button>
        </div>
      </header>

      {primary && (
        <section className="grid gap-2 border-l-2 pl-3" style={{ borderColor: `var(--${status === 2 ? 'bad' : 'warn'})` }}>
          <h3 className={`font-medium ${STATUS_TEXT[status]}`}>{ANOMALY_INFO[primary.type].label[0].toUpperCase() + ANOMALY_INFO[primary.type].label.slice(1)}</h3>
          <ul className="grid gap-1 text-muted-foreground">{anomalies!.map(a => <li key={a.type}>{a.evidence}</li>)}</ul>
          {lossKg[index] > 0 && <p className="text-muted-foreground">{campaign === FORECAST ? 'Producción prevista' : 'Cosecha'} frente a su potencial: {signedPercent(-lossKg[index] / analysis.potentialKg[index])} · {eur(euros(lossKg[index], assumptions))} esta campaña</p>}
          <p>{ANOMALY_INFO[primary.type].action}</p>
          {high > 0 && <p className="text-muted-foreground">No actuar cuesta <span className="font-medium text-foreground">{int(low)}–{int(high)} €</span> por campaña</p>}
        </section>
      )}

      <div className="grid grid-cols-4 gap-2">
        {[
          ['Copa', <Sparkline label="Volumen de copa por campaña" current={campaign} values={tree.snapshots.map(s => s.volume)} />],
          ['Vigor', <Sparkline label="Vigor por campaña" current={campaign} values={tree.snapshots.map(s => s.vigor)} />],
          ['Estrés', <Sparkline label="Estrés hídrico por campaña" current={campaign} values={tree.snapshots.map(s => s.waterStress)} />],
          ['Cosecha', <Sparkline label="Cosecha por campaña; 2026 es previsión" current={campaign} values={[twin.campaigns[0].kg[index], twin.campaigns[1].kg[index], forecast.kg[index]]} forecast={[forecast.kgLow[index], forecast.kgHigh[index]]} />],
        ].map(([label, chart]) => (
          <figure key={label as string} className="m-0 grid gap-1">
            <figcaption className="text-[11px] text-muted-foreground">{label}</figcaption>
            {chart}
          </figure>
        ))}
      </div>

      <dl className="m-0 grid divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_1fr] gap-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="m-0 text-[13px]">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="grid gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Historial</h3>
        <ul className="grid gap-1.5 text-[13px]">
          {history.map(({ task, outcome }) => (
            <li key={task.id} className="grid grid-cols-[96px_1fr] gap-3">
              <span className="text-muted-foreground">{new Date(task.completedAt ?? task.createdAt).toLocaleDateString('es-ES')}</span>
              {TASK_LABEL[task.type]} · {outcome === 'confirmado' ? 'problema confirmado en campo' : 'sin problema en campo (falso positivo)'}
            </li>
          ))}
          {tree.pruneYears.slice().reverse().map(year => <li key={year} className="grid grid-cols-[96px_1fr] gap-3"><span className="text-muted-foreground">{plot.pruneMonth} {year}</span>Poda</li>)}
          {plot.treatments.slice().reverse().map(t => <li key={t.date + t.label} className="grid grid-cols-[96px_1fr] gap-3"><span className="text-muted-foreground">{t.date}</span>{t.label}</li>)}
        </ul>
      </section>

      <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur">
        <Button className="flex-1" onClick={() => createTask(primary ? ANOMALY_INFO[primary.type].task : 'inspeccion', [index], primary?.type)}>
          Crear tarea
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => select([index], 'toggle')}>
          {selected ? 'Quitar de selección' : 'Añadir a selección'}
        </Button>
      </div>
    </article>
  );
}
