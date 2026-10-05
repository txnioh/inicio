import type { CampaignAnalysis } from './analyze.ts';
import type { Anomaly, AnomalyType, Cause, Outcome, Status, Task, Tree } from './types.ts';

/*
  What the field says back. A false positive clears that diagnosis on that
  tree from the task's campaign on; a confirmation is kept for the record and
  counts towards the precision the twin reports per anomaly type.
*/

export type Feedback = {
  status: Uint8Array;
  anomalies: (Anomaly[] | null)[];
  /** Last field result per tree, newest last. */
  history: Map<number, { task: Task; outcome: Outcome }[]>;
  precision: Partial<Record<AnomalyType, { confirmed: number; checked: number }>>;
};

export function applyFeedback(analysis: CampaignAnalysis, tasks: Task[]): Feedback {
  const history = new Map<number, { task: Task; outcome: Outcome }[]>();
  const cleared = new Map<number, Set<AnomalyType>>();
  const precision: Feedback['precision'] = {};
  for (const task of tasks) {
    if (!task.done) continue;
    for (const [key, outcome] of Object.entries(task.results)) {
      const index = Number(key);
      const list = history.get(index) ?? [];
      list.push({ task, outcome });
      history.set(index, list);
      if (task.anomaly) {
        const p = (precision[task.anomaly] ??= { confirmed: 0, checked: 0 });
        p.checked++;
        if (outcome === 'confirmado') p.confirmed++;
        if (outcome === 'falso' && task.campaign <= analysis.campaign) {
          const set = cleared.get(index) ?? new Set();
          set.add(task.anomaly);
          cleared.set(index, set);
        }
      }
    }
  }
  if (!cleared.size) return { status: analysis.status, anomalies: analysis.anomalies, history, precision };

  const status = analysis.status.slice();
  const anomalies = analysis.anomalies.slice();
  for (const [index, types] of cleared) {
    const left = anomalies[index]?.filter(a => !types.has(a.type)) ?? null;
    anomalies[index] = left?.length ? left : null;
    status[index] = (left?.length ? Math.max(...left.map(a => a.severity)) : 0) as Status;
  }
  return { status, anomalies, history, precision };
}

const MATCHES: Record<AnomalyType, Cause> = { estres: 'riego', vigor: 'nitrogeno', copa: 'verticilosis', poda: 'poda' };

/** The simulation knows the planted causes, so it can play the technician's visit. */
export function simulateVisit(tree: Tree, anomaly?: AnomalyType): Outcome {
  if (!anomaly) return tree.cause ? 'confirmado' : 'falso';
  return tree.cause === MATCHES[anomaly] ? 'confirmado' : 'falso';
}
