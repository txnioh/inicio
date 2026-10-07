/*
  Builds the real ground of the simulated farm, once, from public data:
    - field boundaries from the Catastro  → src/model/parcels.json
    - every olive crown in the PNOA photo → src/model/olives.json
  The generator then grows the twin's simulated history on those trees.

    node --experimental-strip-types --no-warnings scripts/build-farm.ts [--debug <dir>]
*/
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pointInPolygon, polygonArea } from '../src/model/geometry.ts';
import { detectOlives } from './detect-olives.ts';
import { fetchParcels } from './fetch-parcels.ts';

/** Farm metres from the origin south of Villacarrillo: about 1.4 × 1.5 km of olive groves. */
const WINDOW = { minX: 450, minY: -150, maxX: 1820, maxY: 1320 };
const MIN_OLIVES_PER_HA = 60;

const debugAt = process.argv.indexOf('--debug');
const debugDir = debugAt > 0 ? process.argv[debugAt + 1] : undefined;

const candidates = await fetchParcels(WINDOW);
const xs = candidates.flatMap(p => p.map(v => v.x)), ys = candidates.flatMap(p => p.map(v => v.y));
const bounds = { minX: Math.min(...xs) - 10, minY: Math.min(...ys) - 10, maxX: Math.max(...xs) + 10, maxY: Math.max(...ys) + 10 };

const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
const olives = await detectOlives(bounds, debugDir ? {
  dir: debugDir,
  spots: [['centre', centre.x, centre.y], ['south-west', bounds.minX + 250, bounds.minY + 250], ['north-east', bounds.maxX - 250, bounds.maxY - 250], ['north-west', bounds.minX + 250, bounds.maxY - 250], ['south-east', bounds.maxX - 250, bounds.minY + 250]],
} : undefined);

// Keep olive groves only, and only the olives inside them.
const parcels: { polygon: { x: number; y: number }[]; olives: typeof olives }[] = [];
for (const polygon of candidates) {
  const inside = olives.filter(o => pointInPolygon(o.x, o.y, polygon));
  const hectares = polygonArea(polygon) / 10_000;
  if (inside.length / hectares >= MIN_OLIVES_PER_HA) parcels.push({ polygon, olives: inside });
}
// South-west first, like the old synthetic grid.
parcels.sort((a, b) => {
  const ca = a.polygon.reduce((s, v) => s + v.y, 0) / a.polygon.length, cb = b.polygon.reduce((s, v) => s + v.y, 0) / b.polygon.length;
  return Math.round(ca / 300) - Math.round(cb / 300) || a.polygon[0].x - b.polygon[0].x;
});

const hectares = parcels.reduce((sum, p) => sum + polygonArea(p.polygon) / 10_000, 0);
const count = parcels.reduce((sum, p) => sum + p.olives.length, 0);
console.log(`Farm: ${parcels.length} olive parcels, ${hectares.toFixed(1)} ha, ${count} olives`);

const model = path.join(import.meta.dirname, '..', 'src', 'model');
await writeFile(path.join(model, 'parcels.json'), JSON.stringify({
  source: 'Dirección General del Catastro, INSPIRE Cadastral Parcels (geometry only). Built by scripts/build-farm.ts.',
  units: 'metres east and north of the farm origin; [x, y] per vertex',
  parcels: parcels.map(p => p.polygon.map(v => [v.x, v.y])),
}) + '\n');
// Decimetres keep the file small and stay well inside the photo's own accuracy.
await writeFile(path.join(model, 'olives.json'), JSON.stringify({
  source: 'Detected in the PNOA orthophoto © IGN (CC BY 4.0) by scripts/detect-olives.ts.',
  units: 'decimetres from the farm origin; [x east, y north, crown diameter] per olive, grouped by parcel',
  parcels: parcels.map(p => p.olives.flatMap(o => [Math.round(o.x * 10), Math.round(o.y * 10), Math.round(o.diameter * 10)])),
}) + '\n');
console.log('Wrote src/model/parcels.json and src/model/olives.json');
