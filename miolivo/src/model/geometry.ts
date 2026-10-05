import type { Point } from './types.ts';

export function pointInPolygon(x: number, y: number, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function polygonArea(polygon: Point[]) {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += polygon[j].x * polygon[i].y - polygon[i].x * polygon[j].y;
  }
  return Math.abs(area) / 2;
}

export function centroid(polygon: Point[]): Point {
  const n = polygon.length;
  return {
    x: polygon.reduce((sum, p) => sum + p.x, 0) / n,
    y: polygon.reduce((sum, p) => sum + p.y, 0) / n,
  };
}

/** Pulls every vertex towards the centroid, leaving room for tracks between plots. */
export function inset(polygon: Point[], metres: number): Point[] {
  const c = centroid(polygon);
  return polygon.map(p => {
    const dx = p.x - c.x, dy = p.y - c.y;
    const d = Math.hypot(dx, dy);
    return { x: p.x - (dx / d) * metres, y: p.y - (dy / d) * metres };
  });
}
