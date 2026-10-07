import type { ReactNode } from 'react';
import type { Feedback } from '../model/feedback.ts';
import type { Twin } from '../model/analyze.ts';
import { euros } from '../model/economics.ts';
import { CAMPAIGNS, FORECAST } from '../model/types.ts';
import { dec, eur, int, tonnes } from '../format.ts';
import { useStore } from '../store.ts';

function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid">
      <dt className="text-[11px] whitespace-nowrap text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1 text-sm font-medium whitespace-nowrap">{children}</dd>
    </div>
  );
}

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
    <header className="flex items-center justify-between gap-6 border-b px-4 py-2.5 max-[820px]:flex-col max-[820px]:items-stretch max-[820px]:gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <svg viewBox="0 0 24 24" className="size-5 flex-none fill-none stroke-primary stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]" aria-hidden="true">
          <path d="M12 21V11" />
          <path d="M12 13c-3-.5-6-2.6-6.5-6.5C9.4 7 11.6 9 12 13Z" />
          <path d="M12 11c2.6-.6 5.4-2.5 6-6 -3.6.6-5.6 2.4-6 6Z" />
          <ellipse cx="15.6" cy="15.2" rx="2.2" ry="2.8" transform="rotate(-25 15.6 15.2)" />
        </svg>
        <h1 className="text-sm font-semibold tracking-tight">MiOlivo</h1>
        <p className="truncate text-xs text-muted-foreground">
          {farm.name} · {farm.municipality} · {dec(hectares, 1)} ha · {int(farm.trees.length)} olivos
        </p>
      </div>
      <dl className="m-0 flex gap-6 max-[820px]:grid max-[820px]:grid-cols-2 max-[820px]:gap-x-4 max-[820px]:gap-y-2">
        <Kpi label={forecast ? `Previsión ${CAMPAIGNS[campaign]}` : `Cosecha ${CAMPAIGNS[campaign]}`}>
          {tonnes(analysis.totals.kg)}{forecast && <span className="text-xs font-normal text-muted-foreground">± {int(margin * 100)} %</span>}
        </Kpi>
        <Kpi label="Aceite">{tonnes(analysis.totals.kg * assumptions.oilYield)}</Kpi>
        <Kpi label="A revisar">
          <span className="inline-flex items-center gap-1"><i className="size-1.5 rounded-full bg-bad" aria-hidden="true" />{int(red)}</span>
          <span className="ml-1.5 inline-flex items-center gap-1"><i className="size-1.5 rounded-full bg-warn" aria-hidden="true" />{int(yellow)}</span>
        </Kpi>
        <Kpi label="En riesgo">{eur(euros(lossKg, assumptions))}</Kpi>
      </dl>
    </header>
  );
}
