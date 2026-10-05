import { centroid, inset, pointInPolygon, polygonArea } from './geometry.ts';
import { gauss, mulberry32, range, valueNoise, type Random } from './rng.ts';
import { CAMPAIGNS, type Cause, type Farm, type Irrigation, type Plot, type Point, type Snapshot, type System, type Tree, type Variety } from './types.ts';

/*
  A plausible olive farm north of Jaén, grown from a seed. Every tree gets a
  hidden baseline (soil, age, its own productivity), a pruning cycle from its
  plot and three campaigns of observations. Four problems are planted where a
  technician would expect them: a failed drip sector, a nitrogen-poor patch,
  rows nobody pruned since 2022 and a few Verticillium foci. The rest of the
  app only sees the observations, never `cause`.
*/

const WIDTH = 1600;
const HEIGHT = 1000;
const COLUMNS = 4;
const ROWS = 3;
const ORIGIN = { lat: 37.8285, lon: -3.7712 };
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

const trad = (irrigation: Irrigation, variety: Variety, spacing: number, planted: [number, number], pruneYears: number[], phase: 0 | 1): PlotSpec =>
  ({ system: 'tradicional', irrigation, variety, spacing: [spacing, spacing], planted, pruneYears, phase });
const intensive = (variety: Variety, pruneYears: number[], phase: 0 | 1): PlotSpec =>
  ({ system: 'intensivo', irrigation: 'goteo', variety, spacing: [8, 6], planted: [2006, 2012], pruneYears, phase });

// Row-major from the south-west corner.
const SPECS: PlotSpec[] = [
  trad('secano', 'Picual', 12, [1925, 1950], [2022, 2024, 2026], 0),
  trad('secano', 'Picual', 12, [1930, 1955], [2023, 2025], 1),
  trad('goteo', 'Picual', 10, [1986, 1992], [2023, 2025], 0),
  intensive('Arbequina', [2024, 2025, 2026], 1),
  trad('secano', 'Picual', 11, [1948, 1965], [2022, 2024, 2026], 1),
  trad('goteo', 'Picual', 10, [1988, 1995], [2022, 2024, 2026], 0), // failed drip sector
  intensive('Picual', [2024, 2025, 2026], 0),
  trad('secano', 'Hojiblanca', 12, [1920, 1940], [2023, 2025], 0),
  trad('secano', 'Picual', 12, [1935, 1960], [2022, 2024, 2026], 1), // nitrogen-poor patch
  trad('goteo', 'Picual', 10, [1990, 1996], [2022, 2024, 2026], 1), // unpruned rows
  trad('secano', 'Picual', 12, [1925, 1945], [2023, 2025], 0),
  trad('goteo', 'Hojiblanca', 10, [1985, 1992], [2023, 2025], 1),
];

const PRODUCTIVITY = { secano: 0.55, goteo: 0.8, intensivo: 1.0 }; // kg of olives per m³ of crown
const VARIETY_FACTOR: Record<Variety, number> = { Picual: 1, Hojiblanca: 0.9, Arbequina: 1.05 };
const PRUNE_MONTHS = ['enero', 'febrero', 'marzo'];

// Spring 2025 was wet across Andalusia; 2024 and 2026 drier.
const YEAR_STRESS = { secano: [0.05, -0.06, 0.03], goteo: [0.02, -0.03, 0.01] };
const YEAR_VIGOR = { secano: [-3, 3, -1], goteo: [-1, 1, 0] };

function plotPolygons(random: Random) {
  const corners: Point[][] = [];
  for (let c = 0; c <= COLUMNS; c++) {
    corners.push([]);
    for (let r = 0; r <= ROWS; r++) {
      const edgeX = c === 0 || c === COLUMNS, edgeY = r === 0 || r === ROWS;
      corners[c].push({
        x: (c * WIDTH) / COLUMNS + (edgeX ? range(random, -12, 12) : range(random, -45, 45)),
        y: (r * HEIGHT) / ROWS + (edgeY ? range(random, -12, 12) : range(random, -40, 40)),
      });
    }
  }
  const polygons: Point[][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      polygons.push(inset([corners[c][r], corners[c + 1][r], corners[c + 1][r + 1], corners[c][r + 1]], 7));
    }
  }
  return polygons;
}

const toLatLon = (x: number, y: number) => ({
  lat: ORIGIN.lat + y / METRES_PER_DEGREE,
  lon: ORIGIN.lon + x / (METRES_PER_DEGREE * Math.cos((ORIGIN.lat * Math.PI) / 180)),
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
  const polygons = plotPolygons(random);

  const plots: Plot[] = polygons.map((polygon, p) => {
    const spec = SPECS[p];
    return {
      id: String(1037 + p),
      sigpac: `23:050:0:0:12:${1037 + p}`,
      polygon,
      centroid: centroid(polygon),
      hectares: polygonArea(polygon) / 10_000,
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
  const sectorPlot = 5, nitrogenPlot = 8, pruningPlot = 9;
  const nitrogen = { x: plots[nitrogenPlot].centroid.x + range(random, -50, 50), y: plots[nitrogenPlot].centroid.y + range(random, -40, 40), r: 78 };
  const sector = { u: range(random, -60, 20), v: range(random, -40, 20), length: 120, width: 70 };
  const unpruned = { v: range(random, -60, 40), width: 52 };
  const foci = [2, 6, 11, 3, 6].map(p => {
    const c = plots[p].centroid;
    return { x: c.x + range(random, -110, 110), y: c.y + range(random, -90, 90), r: range(random, 16, 26) };
  });

  const trees: Tree[] = [];
  plots.forEach((plot, p) => {
    const spec = SPECS[p];
    const angle = range(random, -0.35, 0.35) + (spec.system === 'intensivo' ? Math.PI / 2 : 0);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const [su, sv] = spec.spacing;
    const c = plot.centroid;
    const reach = Math.max(...plot.polygon.map(v => Math.hypot(v.x - c.x, v.y - c.y)));
    const traditional = spec.system === 'tradicional';
    const prodBase = traditional ? PRODUCTIVITY[spec.irrigation] : PRODUCTIVITY.intensivo;
    const bearing = traditional && spec.irrigation === 'secano' ? 0.2 : 0.1;

    for (let i = -Math.ceil(reach / su); i <= reach / su; i++) {
      for (let j = -Math.ceil(reach / sv); j <= reach / sv; j++) {
        const u = i * su, v = j * sv;
        const x = c.x + u * ux - v * uy + gauss(random) * 0.3;
        const y = c.y + u * uy + v * ux + gauss(random) * 0.3;
        if (!pointInPolygon(x, y, plot.polygon)) continue;
        // Distance to the polygon edge would be exact; a margin on the inset is enough here.
        if (random() < 0.025) continue; // marra: a missing tree

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

        const young = random() < 0.02; // a replanted tree
        const plantedYear = young ? Math.floor(range(random, 2008, 2018)) : Math.floor(range(random, spec.planted[0], spec.planted[1] + 1));
        const s = soil(x, y), tilt = slope(x, y);
        const baseDiameter = (traditional ? 6.4 - (12 - su) * 0.25 : 3.8) * (young ? 0.6 : 1) * (1 + s * 0.06 + gauss(random) * 0.05);
        const baseHeight = (traditional ? 4.6 - (12 - su) * 0.1 : 3.4) * (young ? 0.75 : 1) + s * 0.2 + gauss(random) * 0.22;
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
    }
  });

  const xs = plots.flatMap(plot => plot.polygon.map(v => v.x));
  const ys = plots.flatMap(plot => plot.polygon.map(v => v.y));
  return {
    name: 'Finca Las Viñas',
    municipality: 'Jaén',
    origin: ORIGIN,
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    gate: { x: Math.min(...xs) - 4, y: HEIGHT / 2 },
    plots,
    trees,
  };
}
