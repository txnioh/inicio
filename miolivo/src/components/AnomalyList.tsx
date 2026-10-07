import { ListPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
    <div className="grid gap-4">
      <ToggleGroup
        type="single"
        value={filter ?? 'todas'}
        onValueChange={value => setFilter(!value || value === 'todas' ? null : value as AnomalyType)}
        aria-label="Filtrar por tipo"
        spacing={1}
        className="flex-wrap"
      >
        <ToggleGroupItem value="todas" size="sm" variant="outline" className="rounded-full px-2.5 text-xs">Todas</ToggleGroupItem>
        {ANOMALY_ORDER.filter(type => counts[type]).map(type => (
          <ToggleGroupItem key={type} value={type} size="sm" variant="outline" className="rounded-full px-2.5 text-xs">
            {ANOMALY_INFO[type].short} <span className="text-muted-foreground tabular-nums">{int(counts[type]!)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {!shown.length && <p className="text-muted-foreground">Ningún olivo se aparta de su entorno en esta campaña.</p>}

      <ol className="-mx-2 grid">
        {shown.map(group => {
          const plot = twin.farm.plots[group.plot];
          const loss = euros(group.lossKg, assumptions);
          return (
            <li key={group.key} className="group/item flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60">
              <i className={`mt-1.5 size-2 flex-none rounded-full ${group.red ? 'bg-bad' : 'bg-warn'}`} aria-hidden="true" />
              <button type="button" className="grid min-w-0 flex-1 gap-0.5 text-left" onClick={() => open(group)}>
                <span className="font-medium">Parcela {plot.id} · {ANOMALY_INFO[group.type].label}</span>
                <span className="text-xs text-muted-foreground">
                  {plural(group.trees.length, 'olivo', 'olivos')}
                  {group.red > 0 && <> · {int(group.red)} para actuar</>}
                  {loss >= 1 && <> · <span className="text-foreground">{eur(loss)}</span></>}
                </span>
                <span className="text-xs text-muted-foreground">{ANOMALY_INFO[group.type].action}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Crear tarea"
                title="Crear tarea"
                className="opacity-60 group-hover/item:opacity-100"
                onClick={() => { select(group.trees); setState({ tab: 'tareas', draft: { type: ANOMALY_INFO[group.type].task, anomaly: group.type } }); focusOn(group.trees); }}
              >
                <ListPlus />
              </Button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
