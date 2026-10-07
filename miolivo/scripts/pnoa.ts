/*
  PNOA orthophoto tiles (© IGN, CC BY 4.0) stitched into one RGB mosaic over the farm.
  Tiles are cached under scripts/.cache so re-running the detector never re-downloads them.
*/
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fromLatLon, toLatLon } from '../src/model/generate.ts';

export const ZOOM = 19;
const TILE = 256;
const WORLD = TILE * 2 ** ZOOM;
const URL = (x: number, y: number) =>
  `https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix=${ZOOM}&tilerow=${y}&tilecol=${x}&format=image/jpeg`;
/** IDEE's TMS mirror of the same imagery, for tiles the WMTS server fails on (TMS counts rows from the south). */
const MIRROR = (x: number, y: number) => `https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/${ZOOM}/${x}/${2 ** ZOOM - 1 - y}.jpeg`;
const CACHE = path.join(import.meta.dirname, '.cache', `pnoa-${ZOOM}`);

/** Global Web Mercator pixel at ZOOM. */
const toPixel = (lat: number, lon: number) => ({
  px: ((lon + 180) / 360) * WORLD,
  py: ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * WORLD,
});
const fromPixel = (px: number, py: number) => ({
  lon: (px / WORLD) * 360 - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / WORLD))) * 180) / Math.PI,
});

export type Mosaic = {
  width: number;
  height: number;
  rgb: Uint8Array;
  /** Metres on the ground per pixel, at the farm's latitude. */
  metresPerPixel: number;
  /** Farm metres (east, north of the origin) of a mosaic pixel, and back. */
  toFarm: (x: number, y: number) => { x: number; y: number };
  toImage: (x: number, y: number) => { x: number; y: number };
};

async function tile(x: number, y: number) {
  const file = path.join(CACHE, `${x}_${y}.jpg`);
  try {
    return await readFile(file);
  } catch {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(attempt % 2 ? MIRROR(x, y) : URL(x, y));
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(file, buffer);
        return buffer;
      }
      if (attempt === 5) throw new Error(`Tile ${x},${y}: HTTP ${response.status}`);
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/** The mosaic covering farm metres [minX, maxX] × [minY, maxY]. */
export async function mosaic(minX: number, minY: number, maxX: number, maxY: number): Promise<Mosaic> {
  await mkdir(CACHE, { recursive: true });
  const sw = toLatLon(minX, minY), ne = toLatLon(maxX, maxY);
  const a = toPixel(ne.lat, sw.lon), b = toPixel(sw.lat, ne.lon);
  const tx0 = Math.floor(a.px / TILE), ty0 = Math.floor(a.py / TILE);
  const tx1 = Math.floor(b.px / TILE), ty1 = Math.floor(b.py / TILE);
  const columns = tx1 - tx0 + 1, rows = ty1 - ty0 + 1;
  const width = columns * TILE, height = rows * TILE;
  const rgb = new Uint8Array(width * height * 3);

  const jobs: [number, number][] = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
  let done = 0;
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const [tx, ty] = job;
      const { data } = await sharp(await tile(tx, ty)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const ox = (tx - tx0) * TILE, oy = (ty - ty0) * TILE;
      for (let row = 0; row < TILE; row++) {
        rgb.set(data.subarray(row * TILE * 3, (row + 1) * TILE * 3), ((oy + row) * width + ox) * 3);
      }
      if (++done % 50 === 0) process.stdout.write(`  ${done}/${columns * rows} tiles\n`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  const originX = tx0 * TILE, originY = ty0 * TILE;
  const centre = toLatLon((minX + maxX) / 2, (minY + maxY) / 2);
  return {
    width,
    height,
    rgb,
    metresPerPixel: (40_075_016.686 * Math.cos((centre.lat * Math.PI) / 180)) / WORLD,
    toFarm: (x, y) => {
      const { lat, lon } = fromPixel(originX + x, originY + y);
      return fromLatLon(lat, lon);
    },
    toImage: (x, y) => {
      const { lat, lon } = toLatLon(x, y);
      const p = toPixel(lat, lon);
      return { x: p.px - originX, y: p.py - originY };
    },
  };
}
