import type { Grid } from '../grid';

export type Scene = {
  key: string;
  animal: string;
  place: string;
  /** Seconds before the scene repeats. */
  loop: number;
  /** A moment that reads well as a still, for reduced motion. */
  still: number;
  bg: string;
  /** Writes the scene's characters for time t into the grid. */
  frame: (g: Grid, t: number) => void;
};
