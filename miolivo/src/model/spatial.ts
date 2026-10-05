/** Uniform grid over tree positions: hit tests, rectangle selection and neighbourhoods. */
export class SpatialGrid {
  readonly size: number;
  private cells = new Map<number, number[]>();
  private xs: Float64Array;
  private ys: Float64Array;

  constructor(xs: Float64Array, ys: Float64Array, size = 20) {
    this.size = size;
    this.xs = xs;
    this.ys = ys;
    for (let i = 0; i < xs.length; i++) {
      const key = this.key(Math.floor(xs[i] / size), Math.floor(ys[i] / size));
      const cell = this.cells.get(key);
      if (cell) cell.push(i);
      else this.cells.set(key, [i]);
    }
  }

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  /** Every index inside the rectangle, in no particular order. */
  rect(minX: number, minY: number, maxX: number, maxY: number, visit: (index: number) => void) {
    const s = this.size;
    for (let cx = Math.floor(minX / s); cx <= Math.floor(maxX / s); cx++) {
      for (let cy = Math.floor(minY / s); cy <= Math.floor(maxY / s); cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (!cell) continue;
        for (const i of cell) {
          const x = this.xs[i], y = this.ys[i];
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) visit(i);
        }
      }
    }
  }

  within(x: number, y: number, radius: number) {
    const found: number[] = [];
    const r2 = radius * radius;
    this.rect(x - radius, y - radius, x + radius, y + radius, i => {
      const dx = this.xs[i] - x, dy = this.ys[i] - y;
      if (dx * dx + dy * dy <= r2) found.push(i);
    });
    return found;
  }

  nearest(x: number, y: number, maxDistance: number) {
    let best = -1, bestD = maxDistance * maxDistance;
    this.rect(x - maxDistance, y - maxDistance, x + maxDistance, y + maxDistance, i => {
      const dx = this.xs[i] - x, dy = this.ys[i] - y;
      const d = dx * dx + dy * dy;
      if (d <= bestD) { bestD = d; best = i; }
    });
    return best;
  }
}
