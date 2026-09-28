// How a photo is painted. None of these values knows what is in the picture:
// they only change colour, the watercolour itself, and how the photo is
// divided into shapes. The page offers two finished watercolour styles, and
// an oil sketch (oil.ts).

import { defaultOil, impastoOil, type Oil } from './oil';

export type Style = {
  /** How bright and airy the washes are; 0 keeps the photo's own values. */
  light: number;
  /** Strength of every colour. */
  saturation: number;
  /** How much hues move towards a watercolour set of pigments. */
  harmony: number;
  /** How far distant shapes fade into the paper. */
  atmosphere: number;
  /** Opacity of each wash. */
  pigment: number;
  /** Flat underpaint that lets near shapes hide what's behind them. */
  cover: number;
  /** How far washes spread past their edges. */
  bleed: number;
  /** Grain and mottling inside the washes. */
  granulation: number;
  /** The darker rim where a wash dries. */
  wetEdges: number;
  /** How many colour groups the photo is divided into. */
  regions: number;
  /** How much near and far keep shapes of the same colour apart. */
  depthSplit: number;
  /** How many light and dark tones each shape is painted in. */
  zones: number;
  /** How rounded and calm the shapes are. */
  simplify: number;
  /** Small dark accents where the photo has contrast. */
  detail: number;
  /** p5.brush's original texture of hard little circles, instead of soft spots. */
  circles: boolean;
};

export const defaultStyle: Style = {
  light: 1, saturation: 1, harmony: 1, atmosphere: 1,
  pigment: 1, cover: .55, bleed: 1, granulation: .55, wetEdges: .5,
  regions: 8, depthSplit: 1, zones: 3, simplify: 1, detail: 1, circles: false,
};

const soft: Style = {
  // Pale, loose and wet: many single-tone shapes, spread wide, no accents.
  ...defaultStyle,
  saturation: .35, harmony: 1.5, atmosphere: 1.4, pigment: .8, cover: .4, bleed: 3, granulation: .3, wetEdges: .95,
  regions: 16, depthSplit: 0, zones: 1, simplify: .8, detail: 0,
};

// Every style also comes classic, as it first was. For the watercolours
// that's every shape on an opaque flat underpaint, textured with hard little
// circles; for the oil sketch, broad loose strokes without relief. `version`
// names the newer one.
export const styles = [
  { id: 'detailed', name: 'Detailed', version: 'Glaze', style: defaultStyle, classic: { ...defaultStyle, cover: 1, circles: true } },
  { id: 'soft', name: 'Soft', version: 'Glaze', style: soft, classic: { ...soft, pigment: .3, cover: 1, circles: true } },
  { id: 'oil', name: 'Oil', version: 'Impasto', oil: impastoOil, classic: defaultOil },
] as const satisfies readonly ({ id: string; name: string; version: string; style: Style; classic: Style }
  | { id: string; name: string; version: string; oil: Oil; classic: Oil })[];

/** Everything a painting is planned from, besides the photo. */
export type Look = { kind: 'watercolour'; style: Style } | { kind: 'oil'; oil: Oil };

export type StyleId = typeof styles[number]['id'];

/** A value a person may adjust, and its range. */
export type Control = { key: string; label: string; min: number; max: number; step: number };

// A few adjustments per kind of style, each changing one thing you can see.
export const controls: Record<Look['kind'], Control[]> = {
  watercolour: [
    { key: 'saturation', label: 'Colour', min: 0, max: 2, step: .05 },
    { key: 'light', label: 'Light', min: 0, max: 1.5, step: .05 },
    { key: 'bleed', label: 'Bleed', min: 0, max: 4, step: .1 },
    { key: 'cover', label: 'Cover', min: 0, max: 1, step: .05 },
    { key: 'regions', label: 'Shapes', min: 4, max: 24, step: 1 },
    { key: 'granulation', label: 'Grain', min: 0, max: 1, step: .05 },
  ],
  oil: [
    { key: 'size', label: 'Brush', min: .6, max: 2, step: .05 },
    { key: 'detail', label: 'Detail', min: 0, max: 1, step: .05 },
    { key: 'length', label: 'Strokes', min: 2, max: 14, step: 1 },
    { key: 'colour', label: 'Colour', min: 0, max: 2, step: .05 },
    { key: 'wet', label: 'Wet', min: 0, max: 1, step: .05 },
    { key: 'relief', label: 'Relief', min: 0, max: 2, step: .05 },
  ],
};

/** Adjusted values, by key. */
export type Tweak = Record<string, number>;

/** What a style paints from; `classic` picks its first version, `tweak` the adjustments on top. */
export function lookFor(id: StyleId, classic = false, tweak: Tweak = {}): Look {
  const chosen = styles.find(s => s.id === id)!;
  return 'style' in chosen ? { kind: 'watercolour', style: { ...(classic ? chosen.classic : chosen.style), ...tweak } }
    : { kind: 'oil', oil: { ...(classic ? chosen.classic : chosen.oil), ...tweak } };
}

/** A look's current value for a control. */
export const valueOf = (look: Look, key: string) =>
  (look.kind === 'watercolour' ? look.style : look.oil)[key as never] as number;
