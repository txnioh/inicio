import { SpatialGrid } from './spatial.ts';
import { CAMPAIGNS, FORECAST, type Anomaly, type AnomalyType, type CampaignIndex, type Farm, type Severity, type Status, type TaskType } from './types.ts';

/*
  The diagnosis only reads observations. Each tree is compared with the trees
  of its own plot within REFERENCE_RADIUS, using medians so a whole affected
  patch cannot drag its own reference down. Trees share references by 60 m
  cell, which keeps 16,000 trees under a few hundred milliseconds.
*/

export const REFERENCE_RADIUS = 150;
const CELL = 60;
const SAMPLE = 161;

export const ANOMALY_INFO: Record<AnomalyType, { label: string; short: string; action: string; task: TaskType; progression: number }> = {
  estres: { label: 'posible estrés hídrico', short: 'Estrés hídrico', action: 'Revisar el sector de riego: goteros, presión y caudal.', task: 'riego', progression: 0.2 },
  copa: { label: 'pérdida de copa · posible verticilosis', short: 'Pérdida de copa', action: 'Inspeccionar síntomas de verticilosis. Desinfectar herramientas antes de podar.', task: 'inspeccion', progression: 0.5 },
  vigor: { label: 'posible déficit de N', short: 'Vigor bajo', action: 'Análisis foliar y ajuste del abonado nitrogenado.', task: 'inspeccion', progression: 0.15 },
  poda: { label: 'sin podar', short: 'Sin podar', action: 'Incluir en la próxima ruta de poda.', task: 'poda', progression: 0.25 },
};
export const ANOMALY_ORDER: AnomalyType[] = ['estres', 'copa', 'vigor', 'poda'];

export type CampaignAnalysis = {
  campaign: CampaignIndex;
  year: number;
  status: Uint8Array;
  anomalies: (Anomaly[] | null)[];
  /** Weighed harvest, or the forecast for the pending campaign. */
  kg: Float64Array;
  kgLow: Float64Array;
  kgHigh: Float64Array;
  /** What the tree would give if it behaved like its healthy surroundings. */
  potentialKg: Float64Array;
  /** Only counted on trees with an anomaly. */
  lossKg: Float64Array;
  /** Canopy area change since 2024. */
  canopyChange: Float64Array;
  reference: { vigor: Float64Array; stress: Float64Array; height: Float64Array; change: Float64Array; count: Int32Array };
  totals: { kg: number; low: number; high: number; lossKg: number; yellow: number; red: number };
};

export type Twin = { farm: Farm; grid: SpatialGrid; campaigns: CampaignAnalysis[] };

function median(values: Float64Array) {
  values.sort();
  const n = values.length;
  if (!n) return NaN;
  return n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2;
}

/** Per-cell reference sets: for each cell, the same-plot trees within the radius of its centre. */
function buildReferences(farm: Farm, grid: SpatialGrid) {
  const cellOf = new Int32Array(farm.trees.length);
  const keys = new Map<string, number>();
  const sets: Int32Array[] = [];
  const counts: number[] = [];
  for (const tree of farm.trees) {
    const cx = Math.floor(tree.x / CELL), cy = Math.floor(tree.y / CELL);
    const key = `${tree.plot}:${cx}:${cy}`;
    let id = keys.get(key);
    if (id === undefined) {
      id = sets.length;
      keys.set(key, id);
      const members = grid.within((cx + 0.5) * CELL, (cy + 0.5) * CELL, REFERENCE_RADIUS).filter(i => farm.trees[i].plot === tree.plot);
      members.sort((a, b) => a - b);
      counts.push(members.length);
      // An even sample is as good a median as the whole set, and far cheaper.
      const step = Math.max(1, members.length / SAMPLE);
      sets.push(Int32Array.from({ length: Math.min(members.length, SAMPLE) }, (_, k) => members[Math.floor(k * step)]));
    }
    cellOf[tree.index] = id;
  }
  return { cellOf, sets, counts };
}

type Robust = { median: Float64Array; spread: Float64Array };

/** Median and scaled MAD per cell. */
function robust(values: Float64Array, sets: Int32Array[]): Robust {
  const med = new Float64Array(sets.length), spread = new Float64Array(sets.length);
  sets.forEach((set, c) => {
    const sample = new Float64Array(set.length);
    for (let k = 0; k < set.length; k++) sample[k] = values[set[k]];
    const m = median(sample);
    for (let k = 0; k < sample.length; k++) sample[k] = Math.abs(sample[k] - m);
    med[c] = m;
    spread[c] = 1.4826 * median(sample);
  });
  return { median: med, spread };
}

const decimal = (value: number, digits: number) => value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value * 100))} %`;

export function analyze(farm: Farm): Twin {
  const n = farm.trees.length;
  const grid = new SpatialGrid(Float64Array.from(farm.trees, t => t.x), Float64Array.from(farm.trees, t => t.y));
  const { cellOf, sets, counts } = buildReferences(farm, grid);
  const metric = (read: (index: number) => number) => {
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) values[i] = read(i);
    return values;
  };
  const z = (value: number, stats: Robust, i: number, floor: number) =>
    (value - stats.median[cellOf[i]]) / Math.max(stats.spread[cellOf[i]], floor);

  // Productivity per plot (kg per m³ of crown), and each tree's own in 2024, before any planted problem.
  const plotProductivity = (k: number) => farm.plots.map((_, p) => median(Float64Array.from(
    farm.trees.filter(t => t.plot === p), t => (t.snapshots[k].harvestKg ?? 0) / t.snapshots[k].volume)));
  const productivity = [plotProductivity(0), plotProductivity(1)];
  // Alternate bearing: the pending campaign follows the pattern of two years before.
  productivity.push(productivity[0]);
  const ownProductivity = metric(i => {
    const t = farm.trees[i];
    const value = (t.snapshots[0].harvestKg ?? 0) / t.snapshots[0].volume / productivity[0][t.plot];
    return Math.min(1.5, Math.max(0.6, value));
  });

  const campaigns = CAMPAIGNS.map((year, k) => {
    const campaign = k as CampaignIndex;
    const snap = (i: number) => farm.trees[i].snapshots[k];
    const vigor = metric(i => snap(i).vigor);
    const stress = metric(i => snap(i).waterStress);
    const height = metric(i => snap(i).height);
    const change = metric(i => (snap(i).canopyDiameter / farm.trees[i].snapshots[0].canopyDiameter) ** 2 - 1);
    const volumeRatio = metric(i => snap(i).volume / farm.trees[i].snapshots[0].volume);
    const vigorRef = robust(vigor, sets), stressRef = robust(stress, sets), heightRef = robust(height, sets);
    const changeRef = robust(change, sets), volumeRef = robust(volumeRatio, sets);

    const status = new Uint8Array(n);
    const anomalies: (Anomaly[] | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const tree = farm.trees[i], cell = cellOf[i], count = counts[cell];
      const found: Anomaly[] = [];
      const add = (type: AnomalyType, severity: Severity, evidence: string) => found.push({ type, severity, evidence });

      const stressDiff = stress[i] - stressRef.median[cell];
      if (z(stress[i], stressRef, i, 0.02) >= 3 && stressDiff >= 0.1) {
        add('estres', stressDiff >= 0.2 ? 2 : 1, `Estrés hídrico (CWSI) ${decimal(stress[i], 2)} frente a ${decimal(stressRef.median[cell], 2)} en los ${count} olivos de su entorno`);
      }
      const changeDiff = change[i] - changeRef.median[cell];
      if (k > 0 && z(change[i], changeRef, i, 0.02) <= -3 && changeDiff <= -0.08) {
        add('copa', changeDiff <= -0.15 ? 2 : 1, `Copa ${percent(change[i])} en ${k === 2 ? 'dos campañas' : 'una campaña'}, frente a ${percent(changeRef.median[cell])} en su entorno`);
      }
      const vigorDiff = vigor[i] - vigorRef.median[cell];
      if (!found.length && z(vigor[i], vigorRef, i, 2) <= -3 && vigorDiff <= -8) {
        add('vigor', vigorDiff <= -14 ? 2 : 1, `Vigor ${Math.round(vigor[i])} frente a ${Math.round(vigorRef.median[cell])} en su entorno, sin estrés hídrico que lo explique`);
      }
      const lastPruning = Math.max(...tree.pruneYears.filter(y => y <= year));
      const heightDiff = height[i] - heightRef.median[cell];
      if (year - lastPruning >= 2 && z(height[i], heightRef, i, 0.1) >= 3 && heightDiff >= 0.6) {
        add('poda', heightDiff >= 1.2 ? 2 : 1, `Altura ${decimal(height[i], 1)} m, ${decimal(heightDiff, 1)} m sobre su entorno · última poda ${lastPruning}`);
      }
      if (found.length) {
        anomalies[i] = found;
        status[i] = Math.max(...found.map(a => a.severity)) as Status;
      }
    }

    const kg = new Float64Array(n), kgLow = new Float64Array(n), kgHigh = new Float64Array(n);
    const potentialKg = new Float64Array(n), lossKg = new Float64Array(n);
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const tree = farm.trees[i], s = snap(i), cell = cellOf[i];
      const plotRate = productivity[k][tree.plot];
      if (k === FORECAST) {
        const fVigor = Math.min(1.15, Math.max(0.4, 1 + 0.01 * (s.vigor - vigorRef.median[cell])));
        const fStress = Math.min(1, Math.max(0.2, 1 - 1.1 * Math.max(0, s.waterStress - stressRef.median[cell])));
        const fLight = Math.min(1, Math.max(0.6, 1 - 0.12 * Math.max(0, s.height - heightRef.median[cell] - 0.3)));
        const value = s.volume * plotRate * ownProductivity[i] * fVigor * fStress * fLight;
        const margin = 0.1 + 0.05 * (anomalies[i]?.length ?? 0);
        kg[i] = value;
        kgLow[i] = value * (1 - margin);
        kgHigh[i] = value * (1 + margin);
        variance += (value * margin) ** 2;
      } else {
        kg[i] = kgLow[i] = kgHigh[i] = s.harvestKg ?? 0;
      }
      const referenceVolume = Math.max(s.volume, tree.snapshots[0].volume * volumeRef.median[cell]);
      potentialKg[i] = referenceVolume * plotRate;
      if (status[i]) lossKg[i] = Math.max(0, potentialKg[i] - kg[i]);
    }

    const sum = (values: Float64Array) => values.reduce((total, v) => total + v, 0);
    const total = sum(kg);
    // Tree errors partly cancel; the model's own bias does not, hence the 7 % floor.
    const margin = k === FORECAST ? Math.sqrt(variance) / total + 0.07 : 0;
    let yellow = 0, red = 0;
    for (const s of status) { if (s === 1) yellow++; else if (s === 2) red++; }

    return {
      campaign, year, status, anomalies, kg, kgLow, kgHigh, potentialKg, lossKg,
      canopyChange: change,
      reference: {
        vigor: Float64Array.from(cellOf, c => vigorRef.median[c]),
        stress: Float64Array.from(cellOf, c => stressRef.median[c]),
        height: Float64Array.from(cellOf, c => heightRef.median[c]),
        change: Float64Array.from(cellOf, c => changeRef.median[c]),
        count: Int32Array.from(cellOf, c => counts[c]),
      },
      totals: { kg: total, low: total * (1 - margin), high: total * (1 + margin), lossKg: sum(lossKg), yellow, red },
    } satisfies CampaignAnalysis;
  });

  return { farm, grid, campaigns };
}

/** The anomaly that decides what to do first. */
export function primaryAnomaly(list: Anomaly[] | null | undefined) {
  if (!list?.length) return null;
  return [...list].sort((a, b) => b.severity - a.severity || ANOMALY_ORDER.indexOf(a.type) - ANOMALY_ORDER.indexOf(b.type))[0];
}
