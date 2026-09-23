export const wrap = (value: number, size: number) => ((value % size) + size) % size;

export type GridCell = { key: string; column: number; row: number; index: number };

// Remember places, not screen slots: reversing direction keeps photographs still.
// The bounded cache retains thousands of cells without growing with every drag.
export function createGridLayout(count: number, random = Math.random) {
  const cells = new Map<string, number>();
  const lastUsed = Array<number>(count).fill(-1);
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Leave enough candidates beyond the exclusion area to avoid settling into
  // a repeating lattice, especially during long horizontal/vertical journeys.
  const radius = Math.min(8, Math.max(1, Math.floor(Math.sqrt(count / 2))));
  let sequence = 0;

  return (column: number, row: number, columns: number, rows: number): GridCell[] => {
    if (count === 0) return [];
    const requested = Array.from({ length: columns * rows }, (_, slot) => {
      const x = column + slot % columns, y = row + Math.floor(slot / columns);
      return { key: `${x}:${y}`, column: x, row: y };
    });
    // Fill the visible center first, then the overscan rings.
    const pending = requested.filter(cell => !cells.has(cell.key)).sort((a, b) => {
      const distance = (cell: typeof a) => Math.hypot(cell.column - column - (columns - 1) / 2,
        cell.row - row - (rows - 1) / 2);
      return distance(a) - distance(b);
    });
    for (const cell of pending) {
      const separation = Array<number>(count).fill(radius + 1);
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          const nearby = cells.get(`${cell.column + x}:${cell.row + y}`);
          if (nearby !== undefined) separation[nearby] = Math.min(separation[nearby], Math.max(Math.abs(x), Math.abs(y)));
        }
      }
      let index = order[0];
      for (const candidate of order) {
        if (separation[candidate] > separation[index]
          || (separation[candidate] === separation[index] && lastUsed[candidate] < lastUsed[index])) index = candidate;
      }
      cells.set(cell.key, index);
      lastUsed[index] = sequence++;
    }
    const result = requested.map(cell => ({ ...cell, index: cells.get(cell.key)! }));
    // Refresh the current window before evicting distant, old coordinates.
    for (const cell of result) { cells.delete(cell.key); cells.set(cell.key, cell.index); }
    while (cells.size > Math.max(4096, result.length)) cells.delete(cells.keys().next().value!);
    return result;
  };
}
