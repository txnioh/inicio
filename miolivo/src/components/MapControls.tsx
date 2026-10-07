import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LAYER_INFO, SCALES, STATUS, STATUS_LABEL, scaleGradient, tickPosition, type Theme } from '../colors.ts';
import { CAMPAIGNS, FORECAST, type CampaignIndex } from '../model/types.ts';
import { setState, useStore, type Layer } from '../store.ts';

const LAYERS = Object.keys(LAYER_INFO) as Layer[];

/** Frosted surface shared by everything that floats over the map. */
export const FLOAT = 'rounded-xl border bg-background/85 shadow-sm backdrop-blur-md';

export function LayerBar() {
  const layer = useStore(s => s.layer);
  return (
    <ToggleGroup
      type="single"
      value={layer}
      onValueChange={value => value && setState({ layer: value as Layer })}
      aria-label="Capa del mapa"
      spacing={0}
      className={`${FLOAT} flex-wrap p-1`}
    >
      {LAYERS.map(key => (
        <ToggleGroupItem key={key} value={key} title={LAYER_INFO[key].title} size="sm" className="rounded-lg px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background">
          {LAYER_INFO[key].label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function TimeSlider() {
  const campaign = useStore(s => s.campaign);
  return (
    <div className={`${FLOAT} grid w-72 gap-2 px-3.5 pt-3 pb-2 max-[820px]:w-full`}>
      <Slider
        min={0} max={2} step={1} value={[campaign]}
        aria-label="Campaña"
        aria-valuetext={`${CAMPAIGNS[campaign]}${campaign === FORECAST ? ', previsión' : ''}`}
        onValueChange={([value]) => setState({ campaign: value as CampaignIndex })}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground" aria-hidden="true">
        {CAMPAIGNS.map((year, k) => (
          <span key={year} className={k === campaign ? 'font-medium text-foreground' : ''}>{year}{k === FORECAST ? ' · previsión' : ''}</span>
        ))}
      </div>
    </div>
  );
}

export function Legend({ theme }: { theme: Theme }) {
  const layer = useStore(s => s.layer);
  if (layer === 'estado') {
    return (
      <div className={`${FLOAT} flex items-center gap-3 px-3 py-2 text-xs`} aria-label="Leyenda">
        {STATUS_LABEL.map((label, k) => (
          <span key={label} className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: STATUS[theme][k] }} />{label}</span>
        ))}
      </div>
    );
  }
  const scale = SCALES[layer];
  return (
    <div className={`${FLOAT} grid w-56 gap-1.5 px-3 py-2 text-[11px] max-[820px]:w-full`} aria-label={`Leyenda: ${LAYER_INFO[layer].title}`}>
      <span className="text-muted-foreground">{LAYER_INFO[layer].title}</span>
      <span className="h-1.5 rounded-full" style={{ background: scaleGradient(layer) }} />
      <span className="relative h-3.5">
        {scale.ticks.map(([value, label], k) => (
          <span
            key={label}
            className={`absolute whitespace-nowrap ${k === 0 ? '' : k === scale.ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${tickPosition(layer, value) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </span>
    </div>
  );
}
