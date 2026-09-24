export default function LoadingProgress({ label, value }: { label: string; value: number }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return <span className="carrete-loading" role="progressbar" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
    {percent}%
  </span>;
}
