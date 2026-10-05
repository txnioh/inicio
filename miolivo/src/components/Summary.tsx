import type { Feedback } from '../model/feedback.ts';
import type { Twin } from '../model/analyze.ts';
import { euros } from '../model/economics.ts';
import { CAMPAIGNS, FORECAST } from '../model/types.ts';
import { dec, eur, int, tonnes } from '../format.ts';
import { useStore } from '../store.ts';

export default function Summary({ twin, feedback, lossKg }: { twin: Twin; feedback: Feedback; lossKg: number }) {
  const campaign = useStore(s => s.campaign);
  const assumptions = useStore(s => s.assumptions);
  const { farm } = twin;
  const analysis = twin.campaigns[campaign];
  const hectares = farm.plots.reduce((sum, p) => sum + p.hectares, 0);
  let yellow = 0, red = 0;
  for (const s of feedback.status) { if (s === 1) yellow++; else if (s === 2) red++; }
  const forecast = campaign === FORECAST;
  const margin = (analysis.totals.high - analysis.totals.kg) / analysis.totals.kg;

  return (
    <header className="summary">
      <div className="brand">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M12 21V11" />
          <path d="M12 13c-3-.5-6-2.6-6.5-6.5C9.4 7 11.6 9 12 13Z" />
          <path d="M12 11c2.6-.6 5.4-2.5 6-6 -3.6.6-5.6 2.4-6 6Z" />
          <ellipse cx="15.6" cy="15.2" rx="2.2" ry="2.8" transform="rotate(-25 15.6 15.2)" />
        </svg>
        <div>
          <h1>MiOlivo</h1>
          <p>{farm.name} · {farm.municipality} · {dec(hectares, 1)} ha · {int(farm.trees.length)} olivos · {farm.plots.length} parcelas</p>
        </div>
      </div>
      <dl className="kpis">
        <div>
          <dt>{forecast ? `Previsión campaña ${CAMPAIGNS[campaign]}` : `Cosecha ${CAMPAIGNS[campaign]} (pesada)`}</dt>
          <dd>{tonnes(analysis.totals.kg)}{forecast && <small> ± {int(margin * 100)} %</small>}</dd>
        </div>
        <div>
          <dt>Aceite estimado</dt>
          <dd>{tonnes(analysis.totals.kg * assumptions.oilYield)}</dd>
        </div>
        <div>
          <dt>Olivos a revisar</dt>
          <dd><span className="dot is-2" aria-hidden="true" />{int(red)} <span className="dot is-1" aria-hidden="true" />{int(yellow)}</dd>
        </div>
        <div>
          <dt>En riesgo esta campaña</dt>
          <dd>{eur(euros(lossKg, assumptions))}</dd>
        </div>
      </dl>
    </header>
  );
}
