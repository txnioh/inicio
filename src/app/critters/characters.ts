// DevDay 2025's critters, frame by frame, as they appear on the animation
// sheet in Studio Dumbar's case-study film. Rows are listed top to bottom;
// the last row stands on the ground.

export const FROGE = {
  idle: ['◎,⹁◎', '(←→)', '(.>__<.)', 'ΛΛΛ ΛΛΛ'],
  wink: ['↦,⹁◎', '(←→)', '(.>__<.)', 'ΛΛΛ ΛΛΛ'],
  blink: ['↦,⹁↤', '(←→)', '(.>__<.)', 'ΛΛΛ ΛΛΛ'],
  crouch: ['◎,⹁◎', '(←→)', '≤≈≈≈≥', 'ΛΛΛ ΛΛΛ'],
  rise: ['◎,⹁◎', '(←→)', '(.>_<.)', '〈〈 〉〉', '/|\\/|\\', 'oooooo'],
  leap: ['◎,⹁◎', '(←→)', '(.>_<.)', '// \\\\', '|| ||', '/|\\ /|\\', 'ooo ooo'],
  apex: ['◎,⹁◎', '(←→)', '(.>_<.)', '// \\\\', '|| ||', '\\\\ //', '/|\\/|\\', 'oooooo'],
  land: ['◎,⹁◎', '(←→)', '≤≈≈≈≥', '〈〈 〉〉', 'ΛΛ ΛΛ'],
  strike: ['◎,⹁◎', '(‹={', '(.>__<.)', 'ΛΛΛ ΛΛΛ'],
  gulp: ['◎,⹁◎', '(←→)', '(.>--<.)', 'ΛΛΛ ΛΛΛ'],
};

export const HOPPER = {
  idle: ['(\\_/)', '(o;;o)', '/(")(")'],
  bend: ['(\\_/›', '(o;;o)', '/(")(")'],
  drop: ['(\\_  ', '(o;;o)\\', '/(")(")'],
  back: ['‹\\_  ', '(o;;o)\\', '/(")(")'],
  flat: ['/(o;;o)\\', '/(")(")'],
  flatBlink: ['/(-;;-)\\', '/(")(")'],
  perk: ['‹\\_/›', '(o;;o)', '/(")(")'],
  narrow: ['(\\/)', '(o;;o)', '/(")(")'],
  turn: ['|)|)', '(° )', '/(")(")'],
};

// Wings open, sweep down, level out, lift and rise, as one flap.
export const HOOTS = {
  sit: ['(ôvô)', '//„„\\\\'],
  blink: ['(-v-)', '//„„\\\\'],
  open: ['‚/(ôvô)\\‚', '„„'],
  down: ['/(ôvô)\\', '/ „„ \\', '/      \\'],
  level: ['——(ôvô)——', '‚   „„   ‚'],
  lift: ['/¯\\(ôvô)/¯\\', '„„  „„  „„'],
  rise: ['\\      /', '\\(ôvô)/', '„„'],
};
export const FLAP = ['open', 'down', 'level', 'lift', 'rise', 'lift', 'level', 'down'] as const;

// Four leg positions in turn, and two blinks.
export const WEBBY = [
  ['‘\\(oo)_>', '‘—({?})—’', '‚     _>'],
  ['<_(oo)/', '‘—({?})\\‚', '<      <'],
  ['<_(oo)>', '‘—({?})—‘', '<‚    ‚<'],
  ['‹(oo)/', '‘—({?})—’', '>     ‚'],
];
export const WEBBY_BLINK = [['<_(-o)>', '‘—({?})—‘', '<‚    ‚<'], ['‹(--)/', '‘—({?})—’', '>     ‚']];

export const SHELLDON = [
  ['   ---     ', ' /·/|\\·\\=o)', ',________/ ', ' „„   „„   '],
  ['   ---     ', ' /·/|\\·\\=o)', ',________/ ', '  /|  /|   '],
];
export const SHELLDON_HIDE = ['   ---     ', ' /·/|\\·\\   ', ',________/ ', ' „„   „„   '];

export const BUBBLES = '}<((°>';
