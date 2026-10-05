// es-ES leaves four-digit numbers ungrouped by default (4500); 'always' keeps 4.500 next to 15.140.
const cache = new Map<string, Intl.NumberFormat>();
const number = (min: number, max: number) => {
  const key = `${min}:${max}`;
  let format = cache.get(key);
  if (!format) cache.set(key, (format = new Intl.NumberFormat('es-ES', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions)));
  return format;
};

export const int = (value: number) => number(0, 0).format(Math.round(value));
export const dec = (value: number, digits = 1) => number(digits, digits).format(value);
export const eur = (value: number) => `${int(value)} €`;
export const tonnes = (kg: number) => `${int(kg / 1000)} t`;
export const signedPercent = (ratio: number) => {
  const value = Math.round(ratio * 1000) / 10;
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${dec(Math.abs(value), 1)} %`;
};
export const plural = (count: number, one: string, many: string) => `${int(count)} ${count === 1 ? one : many}`;
export const coordinates = (lat: number, lon: number) =>
  `${dec(Math.abs(lat), 5)}° ${lat >= 0 ? 'N' : 'S'} · ${dec(Math.abs(lon), 5)}° ${lon >= 0 ? 'E' : 'O'}`;
