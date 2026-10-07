/*
  Real field boundaries: cadastral parcels from the Catastro INSPIRE WFS
  (public geometry, no owner data), in farm metres. Run by build-farm.ts.
*/
import { fromLatLon, toLatLon } from '../src/model/generate.ts';
import { polygonArea } from '../src/model/geometry.ts';
import type { Point } from '../src/model/types.ts';
import type { Area } from './detect-olives.ts';

const MIN_HECTARES = 1.8;
/** 4πA/P²: a circle is 1, a square 0.79; tracks and streams come out far below this. */
const MIN_COMPACTNESS = 0.15;

const perimeter = (polygon: Point[]) =>
  polygon.reduce((sum, p, k) => sum + Math.hypot(p.x - polygon[(k + 1) % polygon.length].x, p.y - polygon[(k + 1) % polygon.length].y), 0);

/** Parcels lying wholly inside `area`, simplified to vertices at least 1.5 m apart. */
export async function fetchParcels(area: Area): Promise<Point[][]> {
  console.log('Asking the Catastro for parcels…');
  const sw = toLatLon(area.minX, area.minY), ne = toLatLon(area.maxX, area.maxY);
  const url = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0&request=GetFeature'
    + `&typeNames=CP:CadastralParcel&srsName=EPSG::4326&bbox=${sw.lat},${sw.lon},${ne.lat},${ne.lon},EPSG::4326`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catastro WFS: HTTP ${response.status}`);
  const xml = new TextDecoder('latin1').decode(await response.arrayBuffer());

  const inside = (p: Point) => p.x >= area.minX && p.x <= area.maxX && p.y >= area.minY && p.y <= area.maxY;
  const parcels: Point[][] = [];
  for (const member of xml.split('<member>').slice(1)) {
    // The first exterior ring; EPSG:4326 in GML 3.2 lists "lat lon" pairs.
    const ring = member.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/);
    if (!ring) continue;
    const numbers = ring[1].trim().split(/\s+/).map(Number);
    const polygon: Point[] = [];
    for (let k = 0; k + 1 < numbers.length; k += 2) {
      const p = fromLatLon(numbers[k], numbers[k + 1]);
      const last = polygon[polygon.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1.5) polygon.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
    }
    const area = polygonArea(polygon);
    if (polygon.length < 4 || area / 10_000 < MIN_HECTARES) continue;
    if ((4 * Math.PI * area) / perimeter(polygon) ** 2 < MIN_COMPACTNESS) continue;
    if (!polygon.every(inside)) continue;
    parcels.push(polygon);
  }
  console.log(`  ${parcels.length} parcels inside the window`);
  return parcels;
}
