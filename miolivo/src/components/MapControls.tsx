import { LAYER_INFO, SCALES, STATUS, STATUS_LABEL, scaleGradient, tickPosition, type Theme } from '../colors.ts';
import { CAMPAIGNS, FORECAST, type CampaignIndex } from '../model/types.ts';
import { setState, useStore, type Layer } from '../store.ts';

const LAYERS = Object.keys(LAYER_INFO) as Layer[];

export function LayerBar() {
  const layer = useStore(s => s.layer);
  return (
    <div className="segmented layer-bar" role="radiogroup" aria-label="Capa del mapa">
      {LAYERS.map(key => (
        <button key={key} type="button" role="radio" aria-checked={layer === key} title={LAYER_INFO[key].title} onClick={() => setState({ layer: key })}>
          {LAYER_INFO[key].label}
        </button>
      ))}
    </div>
  );
}

export function TimeSlider() {
  const campaign = useStore(s => s.campaign);
  return (
    <label className="time-slider">
      <span className="visually-hidden">Campaña</span>
      <input
        type="range" min={0} max={2} step={1} value={campaign}
        aria-valuetext={`${CAMPAIGNS[campaign]}${campaign === FORECAST ? ', previsión' : ''}`}
        onChange={event => setState({ campaign: Number(event.target.value) as CampaignIndex })}
      />
      <span className="time-ticks" aria-hidden="true">
        {CAMPAIGNS.map((year, k) => (
          <span key={year} className={k === campaign ? 'is-current' : ''}>{year}{k === FORECAST ? ' · previsión' : ''}</span>
        ))}
      </span>
    </label>
  );
}

export function Legend({ theme }: { theme: Theme }) {
  const layer = useStore(s => s.layer);
  if (layer === 'estado') {
    return (
      <div className="legend" aria-label="Leyenda">
        {STATUS_LABEL.map((label, k) => (
          <span key={label} className="legend-item"><i style={{ background: STATUS[theme][k] }} />{label}</span>
        ))}
      </div>
    );
  }
  const scale = SCALES[layer];
  return (
    <div className="legend is-scale" aria-label={`Leyenda: ${LAYER_INFO[layer].title}`}>
      <span className="legend-title">{LAYER_INFO[layer].title}</span>
      <span className="legend-bar" style={{ background: scaleGradient(layer) }} />
      <span className="legend-ticks">
        {scale.ticks.map(([value, label]) => (
          <span key={label} style={{ left: `${tickPosition(layer, value) * 100}%` }}>{label}</span>
        ))}
      </span>
    </div>
  );
}
