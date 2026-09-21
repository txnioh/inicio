export const numericSettings = {
  introDuration: { label: 'Entrance duration', min: 400, max: 4000, step: 100, initial: 400, unit: 'ms' },
  introStagger: { label: 'Circle stagger', min: 0, max: 200, step: 10, initial: 50, unit: 'ms' },
  orbitCount: { label: 'Circles', min: 8, max: 28, step: 1, initial: 9, unit: '' },
  circleScale: { label: 'Size', min: 50, max: 160, step: 5, initial: 125, unit: '%' },
  orbitSpeed: { label: 'Orbit speed', min: 0, max: 200, step: 5, initial: 50, unit: '%' },
  distortion: { label: 'Distortion', min: 0, max: 70, step: 1, initial: 53, unit: '%' },
  ripple: { label: 'Ripple', min: 0, max: 12, step: .5, initial: 12, unit: '%' },
  dispersion: { label: 'Chromatic aberration', min: 0, max: 10, step: .5, initial: .5, unit: '%' },
  sideStart: { label: 'Side threshold', min: 40, max: 95, step: 1, initial: 77, unit: '%' },
  fadeDuration: { label: 'Fade duration', min: 0, max: 600, step: 20, initial: 500, unit: 'ms' },
} as const;

export type NumericSetting = keyof typeof numericSettings;
export type CarreteSettings = Record<NumericSetting, number>;

export const defaultSettings = Object.fromEntries(
  Object.entries(numericSettings).map(([key, value]) => [key, value.initial]),
) as CarreteSettings;

export const SETTINGS_KEY = 'carrete-effects-v2';

export function readSettings(): CarreteSettings {
  const settings = { ...defaultSettings };
  try {
    const current = localStorage.getItem(SETTINGS_KEY);
    const saved: unknown = JSON.parse(current ?? localStorage.getItem('carrete-effects-v1') ?? 'null');
    if (!saved || typeof saved !== 'object') return settings;
    const values = saved as Record<string, unknown>;
    for (const key of Object.keys(numericSettings) as NumericSetting[]) {
      const value = values[key];
      // Adopt the new fade default without resetting other saved adjustments.
      if (!current && key === 'fadeDuration' && value === 200) continue;
      const { min, max, step } = numericSettings[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        settings[key] = Math.max(min, Math.min(max, Math.round(value / step) * step));
      }
    }
  } catch { /* Private browsing or an older saved value must not prevent entry. */ }
  return settings;
}
