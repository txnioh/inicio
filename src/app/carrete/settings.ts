export const numericSettings = {
  introDuration: { label: 'Duración de entrada', min: 400, max: 4000, step: 100, initial: 400, unit: 'ms' },
  introStagger: { label: 'Intervalo entre círculos', min: 0, max: 200, step: 10, initial: 50, unit: 'ms' },
  orbitCount: { label: 'Círculos', min: 8, max: 28, step: 1, initial: 9, unit: '' },
  circleScale: { label: 'Tamaño', min: 50, max: 160, step: 5, initial: 125, unit: '%' },
  orbitSpeed: { label: 'Velocidad de giro', min: 0, max: 200, step: 5, initial: 50, unit: '%' },
  distortion: { label: 'Deformación', min: 0, max: 70, step: 1, initial: 53, unit: '%' },
  ripple: { label: 'Ondulación', min: 0, max: 12, step: .5, initial: 12, unit: '%' },
  dispersion: { label: 'Aberración cromática', min: 0, max: 10, step: .5, initial: .5, unit: '%' },
  sideStart: { label: 'Inicio de los laterales', min: 40, max: 95, step: 1, initial: 77, unit: '%' },
  ghostDuration: { label: 'Duración del reveal', min: 500, max: 6000, step: 100, initial: 2000, unit: 'ms' },
  ghostStagger: { label: 'Desfase al explorar', min: 0, max: 800, step: 20, initial: 400, unit: 'ms' },
  ghostSoftness: { label: 'Suavidad del borde', min: 0, max: 100, step: 5, initial: 100, unit: '%' },
} as const;

export const ghostEasings = {
  original: { label: 'Original', value: 'cubic-bezier(.33, 0, .2, 1)' },
  glide: { label: 'Glide', value: 'cubic-bezier(.16, 1, .3, 1)' },
  soft: { label: 'Suave', value: 'cubic-bezier(.45, 0, .2, 1)' },
  linear: { label: 'Lineal', value: 'linear' },
} as const;

export type NumericSetting = keyof typeof numericSettings;
export type GhostDirection = 'up' | 'down' | 'left' | 'right';
export type CarreteSettings = Record<NumericSetting, number> & {
  ghostDirection: GhostDirection;
  ghostEasing: keyof typeof ghostEasings;
};

export const defaultSettings: CarreteSettings = {
  ...Object.fromEntries(Object.entries(numericSettings).map(([key, value]) => [key, value.initial])) as Record<NumericSetting, number>,
  ghostDirection: 'up',
  ghostEasing: 'soft',
};

export const SETTINGS_KEY = 'carrete-effects-v1';

export function readSettings(): CarreteSettings {
  const settings = { ...defaultSettings };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return settings;
    const values = saved as Record<string, unknown>;
    for (const key of Object.keys(numericSettings) as NumericSetting[]) {
      const value = values[key];
      const { min, max, step } = numericSettings[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        settings[key] = Math.max(min, Math.min(max, Math.round(value / step) * step));
      }
    }
    if (['up', 'down', 'left', 'right'].includes(String(values.ghostDirection))) settings.ghostDirection = values.ghostDirection as GhostDirection;
    if (Object.hasOwn(ghostEasings, String(values.ghostEasing))) settings.ghostEasing = values.ghostEasing as CarreteSettings['ghostEasing'];
  } catch { /* Private browsing or an older saved value must not prevent entry. */ }
  return settings;
}
