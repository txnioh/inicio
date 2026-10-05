import { CAMPAIGNS } from '../model/types.ts';

type Props = {
  values: number[];
  /** Index of the campaign being shown. */
  current: number;
  /** The last value is a forecast: dashed, with its range. */
  forecast?: [number, number];
  label: string;
};

/** Three campaigns on a line, small enough to sit beside a number. */
export default function Sparkline({ values, current, forecast, label }: Props) {
  const width = 84, height = 26, pad = 4;
  const all = forecast ? [...values, ...forecast] : values;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || Math.abs(max) || 1;
  const x = (k: number) => pad + (k * (width - pad * 2)) / (CAMPAIGNS.length - 1);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const solid = forecast ? values.slice(0, -1) : values;
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {forecast && (
        <line x1={x(values.length - 1)} x2={x(values.length - 1)} y1={y(forecast[0])} y2={y(forecast[1])} className="sparkline-range" />
      )}
      <polyline points={solid.map((v, k) => `${x(k)},${y(v)}`).join(' ')} className="sparkline-line" />
      {forecast && (
        <line x1={x(values.length - 2)} y1={y(values[values.length - 2])} x2={x(values.length - 1)} y2={y(values[values.length - 1])} className="sparkline-line is-forecast" />
      )}
      {values.map((v, k) => (
        <circle key={k} cx={x(k)} cy={y(v)} r={k === current ? 3 : 1.75} className={k === current ? 'sparkline-dot is-current' : 'sparkline-dot'} />
      ))}
    </svg>
  );
}
