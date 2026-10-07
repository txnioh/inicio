import type { Twin } from './model/analyze.ts';
import { euros, type Assumptions } from './model/economics.ts';
import type { CampaignIndex } from './model/types.ts';
import type { Layer } from './store.ts';
import { dec, int, signedPercent } from './format.ts';

export type Theme = 'light' | 'dark';

export const THEME = {
  light: { ground: '#f5f5f3', plot: '#ecece7', plotLine: '#d6d6cf', label: '#7a7a72', ink: '#1d1c19', route: '#2f5fd0', selection: '#1d1c19', neutral: '#b7ae96', highlight: 'rgba(255,255,255,.22)' },
  dark: { ground: '#0e0e0d', plot: '#181816', plotLine: '#2b2b28', label: '#85857c', ink: '#f2efe6', route: '#7aa2ff', selection: '#f2efe6', neutral: '#4f4c42', highlight: 'rgba(255,255,255,.1)' },
};

export const STATUS = {
  light: ['#7b9651', '#e2a42c', '#d2452f'],
  dark: ['#6f8a48', '#e8b03a', '#ec5a43'],
};
export const STATUS_LABEL = ['Normal', 'Revisar', 'Actuar'];

type Scale = { stops: string[]; min: number; max: number; ticks: [number, string][]; pivot?: number };

const BUCKETS = 12;

export const SCALES: Record<Exclude<Layer, 'estado'>, Scale> = {
  vigor: { stops: ['#c4513a', '#e6c25a', '#4f8a3c'], min: 40, max: 90, ticks: [[40, '40'], [65, '65'], [90, '90']] },
  estres: { stops: ['#3d8c86', '#e6c25a', '#c8432f'], min: 0.15, max: 0.8, ticks: [[0.15, '0,15'], [0.45, '0,45'], [0.8, '0,80']] },
  copa: { stops: ['#b8402c', '#cfc4a8', '#4f8a3c'], min: -0.25, max: 0.1, pivot: 0, ticks: [[-0.25, '−25 %'], [0, '0'], [0.1, '+10 %']] },
  perdida: { stops: ['#f0c27a', '#de6b3a', '#8f1d1d'], min: 0, max: 40, ticks: [[0, '0 €'], [20, '20 €'], [40, '≥ 40 €']] },
};

export const LAYER_INFO: Record<Layer, { label: string; title: string }> = {
  estado: { label: 'Estado', title: 'Estado de cada olivo' },
  vigor: { label: 'Vigor', title: 'Vigor (índice multiespectral, 0–100)' },
  estres: { label: 'Estrés hídrico', title: 'Estrés hídrico (CWSI de cámara térmica)' },
  copa: { label: 'Copa Δ', title: 'Cambio del área de copa desde 2024' },
  perdida: { label: 'Pérdida €', title: 'Pérdida estimada por olivo en esta campaña' },
};

const hex = (value: string) => [1, 3, 5].map(k => parseInt(value.slice(k, k + 2), 16));
function mix(a: string, b: string, t: number) {
  const ca = hex(a), cb = hex(b);
  return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * t)).join(',')})`;
}

function ramp(stops: string[]) {
  return Array.from({ length: BUCKETS }, (_, k) => {
    const t = (k / (BUCKETS - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    return mix(stops[i], stops[i + 1], t - i);
  });
}

/** Position on the scale, 0–1; a pivot sits in the middle even when the range is lopsided. */
function position(scale: Scale, value: number) {
  if (scale.pivot !== undefined) {
    return value < scale.pivot
      ? 0.5 * (1 - Math.min(1, (scale.pivot - value) / (scale.pivot - scale.min)))
      : 0.5 + 0.5 * Math.min(1, (value - scale.pivot) / (scale.max - scale.pivot));
  }
  return Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)));
}

export const scaleGradient = (layer: Exclude<Layer, 'estado'>) => `linear-gradient(90deg, ${SCALES[layer].stops.join(', ')})`;
export const tickPosition = (layer: Exclude<Layer, 'estado'>, value: number) => position(SCALES[layer], value);

/** One colour index per tree, plus the palette it indexes. Drawing batches trees by index. */
export function colourTrees(twin: Twin, layer: Layer, campaign: CampaignIndex, status: Uint8Array, lossKg: Float64Array, assumptions: Assumptions, theme: Theme) {
  const n = twin.farm.trees.length;
  const index = new Uint8Array(n);
  if (layer === 'estado') {
    index.set(status);
    return { index, palette: STATUS[theme] };
  }
  const scale = SCALES[layer];
  const analysis = twin.campaigns[campaign];
  const value = (i: number) => {
    const s = twin.farm.trees[i].snapshots[campaign];
    if (layer === 'vigor') return s.vigor;
    if (layer === 'estres') return s.waterStress;
    if (layer === 'copa') return analysis.canopyChange[i];
    return euros(lossKg[i], assumptions);
  };
  if (layer === 'perdida') {
    // Bucket 0 is "no loss", so healthy trees fade into the ground.
    for (let i = 0; i < n; i++) {
      const v = value(i);
      index[i] = v <= 0.5 ? 0 : 1 + Math.round(position(scale, v) * (BUCKETS - 1));
    }
    return { index, palette: [THEME[theme].neutral, ...ramp(scale.stops)] };
  }
  for (let i = 0; i < n; i++) index[i] = Math.round(position(scale, value(i)) * (BUCKETS - 1));
  return { index, palette: ramp(scale.stops) };
}

export function describeValue(layer: Layer, twin: Twin, campaign: CampaignIndex, i: number, lossEur: number) {
  const s = twin.farm.trees[i].snapshots[campaign];
  if (layer === 'vigor') return `Vigor ${int(s.vigor)}`;
  if (layer === 'estres') return `CWSI ${dec(s.waterStress, 2)}`;
  if (layer === 'copa') return `Copa ${signedPercent(twin.campaigns[campaign].canopyChange[i])}`;
  if (layer === 'perdida') return lossEur > 0.5 ? `Pérdida ${int(lossEur)} €` : 'Sin pérdida estimada';
  return null;
}
