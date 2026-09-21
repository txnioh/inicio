import type { QualityControl, QualityPreference } from './quality';

export default function QualitySelector({ quality }: { quality: QualityControl }) {
  return <label className="carrete-quality">
    <span>Calidad</span>
    <select aria-label="Calidad de imágenes y fotogramas" value={quality.preference}
      title="Lite: menos datos y menor resolución. High: mayor detalle. Auto: se adapta a la conexión y al dispositivo."
      onChange={event => quality.setPreference(event.target.value as QualityPreference)}>
      <option value="auto">Auto · {quality.resolved === 'lite' ? 'Lite' : 'High'}</option>
      <option value="lite">Lite</option>
      <option value="high">High</option>
    </select>
  </label>;
}
