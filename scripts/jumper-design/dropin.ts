// The drop-in start for the .map runs. jumper-design only accepts world-fixed
// ground under a spawn, so Jumper cannot start on the rolling board as it does
// on the site. Instead the board waits on the level top of the run, its front
// wheels at the edge of the start ramp, and Jumper starts on a fixed platform
// beside it, level with the deck. It steps sideways onto the deck (D), then a
// step backwards (S) pushes the board over the edge.
import { courseFor, skateXml, boards, type BoardKind, type Look } from '../../src/app/jumper/skate.ts';

/** Front axle this far before the start ramp's edge. */
const before: Record<BoardKind, number> = { skate: +(globalThis.process?.env?.BEFORE_SKATE ?? 0.03), longboard: +(globalThis.process?.env?.BEFORE_LONG ?? 0.03) };
/** Deck half-width for the .map. On the site a host-side rider keeps Jumper centred on
 *  its 44 cm deck; the official simulator has none, so the deck is wider there. */
const deckHalf = +(globalThis.process?.env?.DECK_HALF ?? 0.3);
const platform = { half: [0.3, 0.3], gap: 0.003 };
const f = (v: number) => v.toFixed(5);

export function dropIn(kind: BoardKind, look: Look) {
  const course = courseFor(kind, look), original = boards[kind];
  const ridden = globalThis.process?.env?.[`BOARD_${kind}`] === 'skate' ? { ...boards.skate, kind } : original;
  // The trucks widen with the deck, so the wheels clear it as they turn.
  const board = { ...ridden, half: [ridden.half[0], deckHalf, ridden.half[2]], track: ridden.track + deckHalf - ridden.half[1], mass: +(globalThis.process?.env?.[`MASS_${kind}`] ?? ridden.mass) };
  boards[kind] = board; // skateXml reads the board from this table
  try { return build(kind, look, course, board); } finally { boards[kind] = original; }
}

function build(kind: BoardKind, look: Look, course: ReturnType<typeof courseFor>, board: typeof boards[BoardKind]) {
  const startAt = -(before[kind] + board.base);
  const full = skateXml('<mujoco><asset>\n</asset><worldbody><geom name="playground_floor"/></worldbody></mujoco>', kind, look, startAt);
  const asset = full.slice(full.indexOf('<asset>') + 7, full.indexOf('</asset>')).trim();
  let world = full.slice(full.indexOf('<worldbody>') + 11, full.indexOf('</worldbody>')).replace(/<geom name="skate_stopper"[^>]*\/>/, '').trim();
  // On the level top: the board's centre frame, and the platform to its left.
  const centre = course.frame(course.rampStart + startAt);
  const deckTop = board.wheel - board.axle + board.half[2];
  const left = [-Math.sin(centre.heading), Math.cos(centre.heading)];
  const across = board.half[1] + platform.gap + platform.half[1];
  const x = centre.p[0] + left[0] * across, y = centre.p[1] + left[1] * across, top = centre.p[2] + deckTop;
  const yaw = centre.heading;
  // The platform touches only the robot (its geoms are contype 1): the deck
  // leaves contype 1 to the robot and cones, so the board can't rub along the
  // platform while Jumper steps across, and wheels and trucks use bit 128.
  world = world.replace(/(<geom name="skate_(?:deck|kick_-?1)"[^>]*?)contype="1"/g, '$1contype="0"');
  // A chock behind the back wheels (wheels only: bit 128), so stepping on can only move the board forward.
  const back = board.base + board.wheel + 0.004 + 0.02, chock = [centre.p[0] - Math.cos(yaw) * back, centre.p[1] - Math.sin(yaw) * back, centre.p[2] + board.wheel * 0.6 - 0.05];
  world += `\n<geom name="dropin_chock" type="box" pos="${chock.map(f).join(' ')}" quat="${f(Math.cos(yaw / 2))} 0 0 ${f(Math.sin(yaw / 2))}" size="0.02 ${f(board.track + 0.05)} ${f(board.wheel * 0.6 + 0.05)}" contype="0" conaffinity="128"/>`;
  world += `\n<geom name="dropin_platform" type="box" pos="${f(x)} ${f(y)} ${f(top - deckTop / 2 - 0.05)}" quat="${f(Math.cos(yaw / 2))} 0 0 ${f(Math.sin(yaw / 2))}" size="${platform.half[0]} ${platform.half[1]} ${f(deckTop / 2 + 0.05)}" contype="0" conaffinity="1" friction="1 .01 .01"/>`;
  return { asset, world, spawn: { position: [x, y, top], yaw: yaw * 180 / Math.PI }, board: { centre: centre.p, deckTop, half: board.half } };
}
