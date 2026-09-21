import type { QualityControl, QualityPreference } from './quality';

export default function QualitySelector({ quality }: { quality: QualityControl }) {
  return <label className="carrete-quality">
    <span>Quality</span>
    <select aria-label="Image and frame quality" value={quality.preference}
      title="Lite: less data and lower resolution. High: more detail. Auto: adapts to your connection and device."
      onChange={event => quality.setPreference(event.target.value as QualityPreference)}>
      <option value="auto">Auto · {quality.resolved === 'lite' ? 'Lite' : 'High'}</option>
      <option value="lite">Lite</option>
      <option value="high">High</option>
    </select>
  </label>;
}
