import { centroid, pointInPolygon, polygonArea } from './geometry.ts';
import olivesData from './olives.json' with { type: 'json' };
import parcelsData from './parcels.json' with { type: 'json' };
import { gauss, mulberry32, range, valueNoise, type Random } from './rng.ts';
import { CAMPAIGNS, type Cause, type Farm, type Irrigation, type Plot, type Point, type Snapshot, type System, type Tree, type Variety } from './types.ts';

/*
  A digital twin grown on real ground south of Villacarrillo (Jaén): the field
  boundaries are cadastral parcels and every tree is an olive detected in the
  PNOA orthophoto, with its measured crown (scripts/build-farm.ts). What the
  photo can't tell is simulated from a seed: each tree's hidden baseline (soil,
  age, its own productivity), its plot's management and three campaigns of
  observations. Four problems are planted where a technician would expect
  them: a failed drip sector, a nitrogen-poor patch, rows nobody pruned since
  2022 and a few Verticillium foci. The rest of the app only sees the
  observations, never `cause`.
*/

// South of Villacarrillo (Jaén), over real olive groves in the PNOA orthophoto.
const ORIGIN = { lat: 38.0655, lon: -3.1491 };
const METRES_PER_DEGREE = 111_320;

type PlotSpec = {
  system: System;
  irrigation: Irrigation;
  variety: Variety;
  spacing: [number, number];
  planted: [number, number];
  pruneYears: number[];
  phase: 0 | 1;
};

const PRUNE_CYCLES = [[2022, 2024, 2026], [2023, 2025]];

/** Management the photo can't show, chosen to fit what it does show: how densely the plot is planted. */
function specFor(olivesPerHa: number, random: Random, irrigation?: Irrigation): PlotSpec {
  const phase = random() < 0.5 ? 0 : 1;
  if (olivesPerHa > 180) {
    return { system: 'intensivo', irrigation: 'goteo', variety: random() < 0.5 ? 'Arbequina' : 'Picual', spacing: [8, 6], planted: [2006, 2012], pruneYears: [2024, 2025, 2026], phase };
  }
  const spacing = Math.round(Math.sqrt(10_000 / olivesPerHa));
  const watered = irrigation ?? (random() < 0.5 ? 'goteo' : 'secano');
  const start = watered === 'goteo' ? Math.floor(range(random, 1980, 1992)) : Math.floor(range(random, 1920, 1950));
  return {
    system: 'tradicional',
    irrigation: watered,
    variety: random() < 0.15 ? 'Hojiblanca' : 'Picual',
    spacing: [spacing, spacing],
    planted: [start, start + Math.floor(range(random, 5, 20))],
    pruneYears: PRUNE_CYCLES[Math.floor(random() * 2)],
    phase,
  };
}

/** Real olives of each parcel, in metres: [x, y, measured crown diameter]. */
const PARCELS: Point[][] = parcelsData.parcels.map(polygon => polygon.map(([x, y]) => ({ x, y })));
const OLIVES: [number, number, number][][] = olivesData.parcels.map(flat => {
  const list: [number, number, number][] = [];
  for (let k = 0; k < flat.length; k += 3) list.push([flat[k] / 10, flat[k + 1] / 10, flat[k + 2] / 10]);
  return list;
});
/** The farmhouse, a small urban parcel where the tracks meet: every route starts there. */
const GATE: Point = { x: 972, y: 478 };

const PRODUCTIVITY = { secano: 0.55, goteo: 0.8, intensivo: 1.0 }; // kg of olives per m³ of crown
const VARIETY_FACTOR: Record<Variety, number> = { Picual: 1, Hojiblanca: 0.9, Arbequina: 1.05 };
const PRUNE_MONTHS = ['enero', 'febrero', 'marzo'];

// Spring 2025 was wet across Andalusia; 2024 and 2026 drier.
const YEAR_STRESS = { secano: [0.05, -0.06, 0.03], goteo: [0.02, -0.03, 0.01] };
const YEAR_VIGOR = { secano: [-3, 3, -1], goteo: [-1, 1, 0] };

const METRES_PER_DEGREE_LON = METRES_PER_DEGREE * Math.cos((ORIGIN.lat * Math.PI) / 180);

export const toLatLon = (x: number, y: number) => ({
  lat: ORIGIN.lat + y / METRES_PER_DEGREE,
  lon: ORIGIN.lon + x / METRES_PER_DEGREE_LON,
});

export const fromLatLon = (lat: number, lon: number) => ({
  x: (lon - ORIGIN.lon) * METRES_PER_DEGREE_LON,
  y: (lat - ORIGIN.lat) * METRES_PER_DEGREE,
});

function treatmentsFor(spec: PlotSpec, random: Random) {
  const day = () => String(1 + Math.floor(random() * 27)).padStart(2, '0');
  const list = [
    { date: `${day()}/11/2025`, label: 'Cobre · prevención de repilo' },
    { date: `${day()}/04/2026`, label: 'Abonado foliar N-P-K' },
    { date: `${day()}/06/2026`, label: 'Trampeo de mosca del olivo' },
  ];
  if (spec.irrigation === 'goteo') list.splice(1, 0, { date: `${day()}/03/2026`, label: 'Fertirrigación' });
  if (spec.system === 'intensivo') list.push({ date: `${day()}/09/2026`, label: 'Cobre · prevención de repilo' });
  return list;
}

export function generateFarm(seed = 2026): Farm {
  const random = mulberry32(seed);
  const soil = valueNoise(seed + 11, 260);
  const slope = valueNoise(seed + 23, 420);
  const hectaresOf = PARCELS.map(polygon => polygonArea(polygon) / 10_000);
  const densityOf = PARCELS.map((_, p) => OLIVES[p].length / hectaresOf[p]);

  // Problems go where a technician would expect them: the drip failure and the unpruned rows
  // in the two largest traditional plots under drip, the nitrogen patch in the largest dry one.
  const traditional = PARCELS.map((_, p) => p).filter(p => densityOf[p] <= 180).sort((a, b) => hectaresOf[b] - hectaresOf[a]);
  const [sectorPlot, nitrogenPlot, pruningPlot] = traditional;
  const forced: Partial<Record<number, Irrigation>> = { [sectorPlot]: 'goteo', [nitrogenPlot]: 'secano', [pruningPlot]: 'goteo' };
  const specs = PARCELS.map((_, p) => specFor(densityOf[p], random, forced[p]));
  // The unpruned rows stand out in a plot pruned this year.
  specs[pruningPlot].pruneYears = PRUNE_CYCLES[0];

  const plots: Plot[] = PARCELS.map((polygon, p) => {
    const spec = specs[p];
    return {
      id: String(1037 + p),
      sigpac: `23:095:0:0:15:${1037 + p}`,
      polygon,
      centroid: centroid(polygon),
      hectares: hectaresOf[p],
      system: spec.system,
      irrigation: spec.irrigation,
      variety: spec.variety,
      spacing: spec.spacing,
      pruneYears: spec.pruneYears,
      pruneMonth: PRUNE_MONTHS[Math.floor(random() * 3)],
      treatments: treatmentsFor(spec, random),
      treeCount: 0,
    };
  });

  // Where the problems are planted.
  const nitrogen = { x: plots[nitrogenPlot].centroid.x + range(random, -50, 50), y: plots[nitrogenPlot].centroid.y + range(random, -40, 40), r: 78 * Math.min(1, specs[nitrogenPlot].spacing[0] / 12) }; // about the same number of trees at any spacing
  const sector = { u: range(random, -60, 20), v: range(random, -40, 20), length: 120, width: 70 };
  const unpruned = { v: range(random, -60, 40), width: 52 };
  const others = PARCELS.map((_, p) => p).filter(p => p !== sectorPlot && p !== nitrogenPlot && p !== pruningPlot)
    .sort((a, b) => OLIVES[b].length - OLIVES[a].length);
  const foci = [others[0], others[1], others[2], others[3], others[1]].map(p => {
    const c = plots[p].centroid;
    return { x: c.x + range(random, -110, 110), y: c.y + range(random, -90, 90), r: range(random, 16, 26) };
  });

  const trees: Tree[] = [];
  plots.forEach((plot, p) => {
    const spec = specs[p];
    // Row direction: the plot's longest side. u runs along it, v across.
    const edges = plot.polygon.map((v, k) => [v, plot.polygon[(k + 1) % plot.polygon.length]] as const);
    const [ea, eb] = edges.reduce((best, e) => (Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y) > Math.hypot(best[1].x - best[0].x, best[1].y - best[0].y) ? e : best));
    const angle = Math.atan2(eb.y - ea.y, eb.x - ea.x);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const [su] = spec.spacing;
    const c = plot.centroid;
    const traditional = spec.system === 'tradicional';
    const prodBase = traditional ? PRODUCTIVITY[spec.irrigation] : PRODUCTIVITY.intensivo;
    const bearing = traditional && spec.irrigation === 'secano' ? 0.2 : 0.1;
    const diameters = OLIVES[p].map(o => o[2]).sort((a, b) => a - b);
    const typical = diameters[Math.floor(diameters.length / 2)];

    for (const [x, y, measured] of OLIVES[p]) {
      if (!pointInPolygon(x, y, plot.polygon)) continue;
      const u = (x - c.x) * ux + (y - c.y) * uy, v = -(x - c.x) * uy + (y - c.y) * ux;

      let cause: Cause | null = null;
      let weight = 1;
      if (p === sectorPlot && Math.abs(u - sector.u) < sector.length / 2 && Math.abs(v - sector.v) < sector.width / 2) cause = 'riego';
      if (p === nitrogenPlot) {
        const d = Math.hypot(x - nitrogen.x, y - nitrogen.y) / nitrogen.r;
        if (d < 1) { cause = 'nitrogeno'; weight = d < 0.65 ? 1 : 1 - (d - 0.65) / 0.35 * 0.5; }
      }
      if (p === pruningPlot && Math.abs(v - unpruned.v) < unpruned.width / 2) cause = 'poda';
      for (const focus of foci) {
        if (Math.hypot(x - focus.x, y - focus.y) < focus.r && random() < 0.75) cause = 'verticilosis';
      }

      // A crown far smaller than its neighbours' is a replanted tree.
      const young = measured < typical * 0.5;
      const plantedYear = young ? Math.floor(range(random, 2008, 2018)) : Math.floor(range(random, spec.planted[0], spec.planted[1] + 1));
      const s = soil(x, y), tilt = slope(x, y);
      // The photo measures the crown; 2024 starts there. Height follows it only loosely,
      // so the real spread of crowns doesn't read as unpruned trees.
      const baseDiameter = Math.max(1.5, measured * (1 + gauss(random) * 0.02));
      const baseHeight = (traditional ? 4.6 - (12 - su) * 0.1 : 3.4) * (young ? 0.75 : 1) + 0.04 * (measured - typical) + s * 0.2 + gauss(random) * 0.22;
      const growth = 0.015 + gauss(random) * 0.008;
      const ownProductivity = Math.exp(gauss(random) * 0.1);
      const baseVigor = 76 + s * 5 + (spec.irrigation === 'goteo' ? 4 : 0) + gauss(random) * 3.2;
      const baseStress = (spec.irrigation === 'secano' ? 0.5 : 0.27) - s * 0.04 + tilt * 0.03 + gauss(random) * 0.025;
      const pruneYears = cause === 'poda' ? [2022] : spec.pruneYears;

      const snapshots = CAMPAIGNS.map((year, k) => {
        const pruned = pruneYears.includes(year);
        let diameter = baseDiameter * (1 + growth) ** k * (pruned ? 0.95 : 1) * (1 + gauss(random) * 0.012);
        let height = baseHeight + 0.15 * k - (pruned ? 0.35 : 0) + gauss(random) * 0.08;
        let vigor = baseVigor + YEAR_VIGOR[spec.irrigation][k] + gauss(random) * 2;
        let stress = baseStress + YEAR_STRESS[spec.irrigation][k] + gauss(random) * 0.022;
        let health = 1;

        if (cause === 'riego' && k > 0) {
          stress += k === 1 ? 0.2 : 0.3;
          vigor -= k === 1 ? 7 : 13;
          diameter *= k === 1 ? 0.99 : 0.96;
        }
        if (cause === 'nitrogeno' && k > 0) {
          vigor -= (k === 1 ? 15 : 27) * weight;
          diameter /= (1 + growth) ** k; // stopped growing
          health -= 0.1 * k * weight;
        }
        if (cause === 'poda') {
          height += 0.9 + 0.2 * k;
          diameter *= 1.04;
          health -= 0.1 + 0.05 * k;
        }
        if (cause === 'verticilosis' && k > 0) {
          diameter *= k === 1 ? 0.95 : 0.89;
          vigor -= k === 1 ? 9 : 19;
          stress += k === 1 ? 0.04 : 0.12;
          health -= k === 1 ? 0.15 : 0.35;
        }

        diameter = Math.max(1.2, diameter);
        height = Math.max(1.6, height);
        vigor = Math.max(5, Math.min(99, vigor));
        stress = Math.max(0.05, Math.min(0.95, stress));
        const crownDepth = height - (traditional ? 1.0 : 0.7);
        const volume = (Math.PI / 6) * diameter * diameter * crownDepth;

        let harvestKg: number | null = null;
        if (year !== CAMPAIGNS[2]) {
          const on = (k + spec.phase) % 2 === 0;
          const stressLoss = 1.1 * Math.max(0, stress - (baseStress + YEAR_STRESS[spec.irrigation][k]));
          const vigorLoss = 0.01 * Math.max(0, baseVigor - vigor);
          const yieldHealth = Math.max(0.15, Math.min(1.1, health - stressLoss - vigorLoss));
          harvestKg = volume * prodBase * VARIETY_FACTOR[spec.variety] * (on ? 1 + bearing : 1 - bearing)
            * yieldHealth * ownProductivity * Math.exp(gauss(random) * 0.1) * (young ? 0.6 : 1);
        }
        return { canopyDiameter: diameter, height, volume, vigor, waterStress: stress, harvestKg } satisfies Snapshot;
      }) as Tree['snapshots'];

      trees.push({
        index: trees.length,
        id: String(trees.length + 1).padStart(6, '0'),
        plot: p,
        x, y,
        ...toLatLon(x, y),
        variety: spec.variety === 'Picual' || random() > 0.04 ? spec.variety : 'Picual',
        plantedYear,
        irrigation: spec.irrigation,
        pruneYears,
        snapshots,
        cause,
      });
      plot.treeCount++;
    }
  });

  const xs = plots.flatMap(plot => plot.polygon.map(v => v.x));
  const ys = plots.flatMap(plot => plot.polygon.map(v => v.y));
  return {
    name: 'Finca Las Viñas',
    municipality: 'Villacarrillo (Jaén)',
    origin: ORIGIN,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    gate: GATE,
    plots,
    trees,
  };
}
