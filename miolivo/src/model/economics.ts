import { ANOMALY_INFO, primaryAnomaly } from './analyze.ts';
import type { Anomaly } from './types.ts';

/** Shown and editable under "Supuestos"; every euro in the app goes through here. */
export type Assumptions = {
  /** kg of oil per kg of olives (rendimiento graso industrial). */
  oilYield: number;
  /** €/kg of extra virgin oil at origin. */
  oilPrice: number;
};

export const DEFAULT_ASSUMPTIONS: Assumptions = { oilYield: 0.2, oilPrice: 4 };

export const euros = (kgOlives: number, a: Assumptions) => kgOlives * a.oilYield * a.oilPrice;

/** Range of what one more campaign without acting costs, in €. Problems that spread cost more. */
export function costOfInaction(lossKg: number, anomalies: Anomaly[] | null, a: Assumptions): [number, number] {
  const primary = primaryAnomaly(anomalies);
  if (!primary || lossKg <= 0) return [0, 0];
  const loss = euros(lossKg, a);
  return [loss * 0.9, loss * (1 + ANOMALY_INFO[primary.type].progression) * 1.1];
}
