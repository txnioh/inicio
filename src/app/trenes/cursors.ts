// Pixel-art cursors, drawn at 2× as SVG data URIs: a pointing hand for things
// you can click on the plan and the board, and a double arrow for dragging
// through the day.
const HAND = [
  '....##......',
  '...#..#.....',
  '...#..#.....',
  '...#..#.....',
  '...#..###...',
  '...#..#..##.',
  '.###..#..#.#',
  '#..#.......#',
  '#..........#',
  '.#.........#',
  '..#........#',
  '..#.......#.',
  '...#......#.',
  '....######..',
];

const ARROWS = [
  '...#.....#...',
  '..##.....##..',
  '.###########.',
  '..##.....##..',
  '...#.....#...',
];

const rect = (x: number, y: number, fill: string) => `<rect x='${x * 2}' y='${y * 2}' width='2' height='2' fill='${fill}'/>`;

function svg(width: number, height: number, body: string) {
  const markup = `<svg xmlns='http://www.w3.org/2000/svg' width='${width * 2}' height='${height * 2}' shape-rendering='crispEdges'>${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
}

// The hand: black outline, filled white between its edges on each row.
function hand() {
  let body = '';
  HAND.forEach((row, y) => {
    const first = row.indexOf('#');
    const last = row.lastIndexOf('#');
    for (let x = first; x <= last; x++) body += rect(x, y, row[x] === '#' ? '#111' : '#fff');
  });
  return `${svg(12, 14, body)} 9 1, pointer`;
}

// The arrows: solid black with a one-pixel white halo, to show on any ground.
function arrows() {
  const on = (x: number, y: number) => ARROWS[y]?.[x] === '#';
  let halo = '';
  let ink = '';
  for (let y = -1; y <= ARROWS.length; y++) {
    for (let x = -1; x <= ARROWS[0].length; x++) {
      if (on(x, y)) ink += rect(x + 1, y + 1, '#111');
      else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => on(x + dx, y + dy))) halo += rect(x + 1, y + 1, '#fff');
    }
  }
  return `${svg(ARROWS[0].length + 2, ARROWS.length + 2, halo + ink)} 15 6, ew-resize`;
}

export const cursors = { '--cursor-hand': hand(), '--cursor-drag': arrows() };
