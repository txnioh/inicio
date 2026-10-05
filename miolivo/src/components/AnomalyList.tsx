import { useMemo, useState } from 'react';
import { ANOMALY_INFO, ANOMALY_ORDER, primaryAnomaly, type Twin } from '../model/analyze.ts';
import { euros } from '../model/economics.ts';
import type { Feedback } from '../model/feedback.ts';
import type { AnomalyType } from '../model/types.ts';
import { eur, int, plural } from '../format.ts';
import { focusOn, select, setState, useStore } from '../store.ts';

type Group = { key: string; plot: number; type: AnomalyType; trees: number[]; red: number; lossKg: number };

export default function AnomalyList({ twin, feedback, lossKg }: { twin: Twin; feedback: Feedback; lossKg: Float64Array }) {
  const assumptions = useStore(s => s.assumptions);
  const [filter, setFilter] = useState<AnomalyType | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    feedback.anomalies.forEach((list, i) => {
      const primary = primaryAnomaly(list);
      if (!primary) return;
      const plot = twin.farm.trees[i].plot;
      const key = `${plot}:${primary.type}`;
      const group = map.get(key) ?? { key, plot, type: primary.type, trees: [], red: 0, lossKg: 0 };
      group.trees.push(i);
      group.lossKg += lossKg[i];
      if (feedback.status[i] === 2) group.red++;
      map.set(key, group);
    });
    return [...map.values()].sort((a, b) => b.lossKg - a.lossKg || b.trees.length - a.trees.length);
  }, [feedback, lossKg, twin]);

  const counts = useMemo(() => {
    const result: Partial<Record<AnomalyType, number>> = {};
    for (const g of groups) result[g.type] = (result[g.type] ?? 0) + g.trees.length;
    return result;
  }, [groups]);

  const shown = filter ? groups.filter(g => g.type === filter) : groups;

  const open = (group: Group) => {
    select(group.trees);
    focusOn(group.trees);
  };

  return (
    <div className="anomalies">
      <div className="chips" role="group" aria-label="Filtrar por tipo">
        <button type="button" aria-pressed={!filter} onClick={() => setFilter(null)}>Todas</button>
        {ANOMALY_ORDER.filter(type => counts[type]).map(type => (
          <button key={type} type="button" aria-pressed={filter === type} onClick={() => setFilter(filter === type ? null : type)}>
            {ANOMALY_INFO[type].short} <span>{int(counts[type]!)}</span>
          </button>
        ))}
      </div>

      {!shown.length && <p className="empty">Ningún olivo se aparta de su entorno en esta campaña.</p>}

      <ol className="group-list">
        {shown.map(group => {
          const plot = twin.farm.plots[group.plot];
          const loss = euros(group.lossKg, assumptions);
          return (
            <li key={group.key} className={`group is-${group.red ? 2 : 1}`}>
              <button type="button" className="group-main" onClick={() => open(group)}>
                <span className="group-title">Parcela {plot.id} · {ANOMALY_INFO[group.type].label}</span>
                <span className="group-meta">
                  {plural(group.trees.length, 'olivo', 'olivos')}
                  {group.red > 0 && <> · {int(group.red)} para actuar</>}
                  {loss >= 1 && <> · pérdida estimada <strong>{eur(loss)}</strong></>}
                </span>
                <span className="group-action">{ANOMALY_INFO[group.type].action}</span>
              </button>
              <button
                type="button"
                className="button is-small"
                onClick={() => { select(group.trees); setState({ tab: 'tareas', draft: { type: ANOMALY_INFO[group.type].task, anomaly: group.type } }); focusOn(group.trees); }}
              >
                Crear tarea
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
