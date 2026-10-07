import { Box, Image, Map as MapIcon, Settings2, SquareDashedMousePointer, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { colourTrees, type Theme } from './colors.ts';
import AnomalyList from './components/AnomalyList.tsx';
import FarmMap from './components/FarmMap.tsx';
import { FLOAT, LayerBar, Legend, TimeSlider } from './components/MapControls.tsx';
import Summary from './components/Summary.tsx';
import TaskPanel from './components/TaskPanel.tsx';
import TreeCard from './components/TreeCard.tsx';
import type { Twin } from './model/analyze.ts';
import { DEFAULT_ASSUMPTIONS, euros } from './model/economics.ts';
import { applyFeedback } from './model/feedback.ts';
import { eur, plural } from './format.ts';
import { getState, getTwin, openTree, select, setState, useStore, type Tab } from './store.ts';

function useTheme(): Theme {
  const query = useMemo(() => matchMedia('(prefers-color-scheme: dark)'), []);
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const update = () => setDark(query.matches);
    query.addEventListener('change', update);
    document.documentElement.classList.toggle('dark', dark);
    return () => query.removeEventListener('change', update);
  }, [query, dark]);
  return dark ? 'dark' : 'light';
}

const TABS: [Tab, string][] = [['anomalias', 'Anomalías'], ['olivo', 'Olivo'], ['tareas', 'Tareas']];

function Assumptions() {
  const assumptions = useStore(s => s.assumptions);
  const set = (key: keyof typeof assumptions, value: number) => {
    if (Number.isFinite(value) && value > 0) setState({ assumptions: { ...assumptions, [key]: value } });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Supuestos económicos" title="Supuestos económicos"><Settings2 /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="grid w-72 gap-3 text-[13px]">
        <p className="font-medium">Supuestos económicos</p>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="oil-yield" className="font-normal">Rendimiento graso, %</Label>
          <Input id="oil-yield" type="number" min={5} max={35} step={0.5} className="h-7 w-20 text-right" value={Math.round(assumptions.oilYield * 1000) / 10} onChange={e => set('oilYield', Number(e.target.value) / 100)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="oil-price" className="font-normal">Precio del aceite, €/kg</Label>
          <Input id="oil-price" type="number" min={1} max={15} step={0.1} className="h-7 w-20 text-right" value={assumptions.oilPrice} onChange={e => set('oilPrice', Number(e.target.value))} />
        </div>
        <p className="text-xs text-muted-foreground">La pérdida es lo que daría el olivo al ritmo de su entorno sano menos lo que da o se prevé, solo en olivos con anomalía. € = kg × rendimiento × precio.</p>
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setState({ assumptions: DEFAULT_ASSUMPTIONS })}>Restablecer</Button>
      </PopoverContent>
    </Popover>
  );
}

function Workspace({ twin }: { twin: Twin }) {
  const theme = useTheme();
  const campaign = useStore(s => s.campaign);
  const layer = useStore(s => s.layer);
  const tab = useStore(s => s.tab);
  const tasks = useStore(s => s.tasks);
  const selection = useStore(s => s.selection);
  const assumptions = useStore(s => s.assumptions);
  const basemap = useStore(s => s.basemap);
  const threeD = useStore(s => s.threeD);
  const [selectMode, setSelectMode] = useState(false);

  const analysis = twin.campaigns[campaign];
  const feedback = useMemo(() => applyFeedback(analysis, tasks), [analysis, tasks]);
  // A diagnosis the field ruled out no longer carries a loss.
  const lossKg = useMemo(() => feedback.status === analysis.status ? analysis.lossKg : analysis.lossKg.map((v, i) => (feedback.status[i] ? v : 0)), [analysis, feedback]);
  const totalLoss = useMemo(() => lossKg.reduce((sum, v) => sum + v, 0), [lossKg]);
  const colours = useMemo(() => colourTrees(twin, layer, campaign, feedback.status, lossKg, assumptions, theme), [twin, layer, campaign, feedback, lossKg, assumptions, theme]);
  const selectionLoss = useMemo(() => selection.reduce((sum, i) => sum + lossKg[i], 0), [selection, lossKg]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (event.target as HTMLElement).closest('input, textarea')) return;
      const s = getState();
      if (s.tree !== null) openTree(null);
      else if (s.selection.length) select([]);
      else setSelectMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const open = tasks.filter(t => !t.done).length;

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] max-[820px]:h-auto max-[820px]:min-h-dvh">
      <Summary twin={twin} feedback={feedback} lossKg={totalLoss} />
      <main className="grid min-h-0 grid-cols-[minmax(0,1fr)_380px] max-[820px]:grid-cols-1">
        <section className="relative min-h-0 overflow-hidden max-[820px]:h-[62svh]" aria-label="Mapa de la finca">
          <FarmMap twin={twin} theme={theme} colours={colours} anomalies={feedback.anomalies} status={feedback.status} lossKg={lossKg} selectMode={selectMode} />
          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2 *:pointer-events-auto">
            <LayerBar />
            <div className={`${FLOAT} flex gap-0.5 p-1`}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={basemap === 'foto' ? 'Ver plano' : 'Ver foto aérea'}
                title={basemap === 'foto' ? 'Plano' : 'Foto aérea (PNOA)'}
                onClick={() => setState({ basemap: basemap === 'foto' ? 'plano' : 'foto' })}
              >
                {basemap === 'foto' ? <MapIcon /> : <Image />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={threeD}
                aria-label="Vista 3D"
                title="Vista 3D (clic derecho y arrastrar para girar)"
                className={threeD ? 'bg-foreground text-background hover:bg-foreground/90 hover:text-background' : ''}
                onClick={() => setState({ threeD: !threeD })}
              >
                <Box />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-pressed={selectMode}
                aria-label="Seleccionar área"
                title="Seleccionar área (Mayús + arrastrar)"
                className={selectMode ? 'bg-route text-white hover:bg-route/90 hover:text-white' : ''}
                onClick={() => setSelectMode(on => !on)}
              >
                <SquareDashedMousePointer />
              </Button>
            </div>
          </div>
          {selection.length > 0 && (
            <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-foreground py-1.5 pr-1.5 pl-3.5 text-[13px] whitespace-nowrap text-background shadow-lg max-[820px]:top-16 max-[820px]:bottom-auto" role="status">
              <span className="mr-2"><span className="font-medium">{plural(selection.length, 'olivo', 'olivos')}</span>{selectionLoss > 0 && <span className="opacity-60"> · {eur(euros(selectionLoss, assumptions))}</span>}</span>
              <Button size="sm" variant="secondary" onClick={() => setState({ tab: 'tareas' })}>Crear tarea</Button>
              <Button size="icon-sm" variant="ghost" aria-label="Limpiar selección" className="text-background hover:bg-background/10 hover:text-background" onClick={() => { select([]); setState({ draft: null }); }}><X /></Button>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2 *:pointer-events-auto">
            <TimeSlider />
            <Legend theme={theme} />
          </div>
        </section>
        <aside className="flex min-h-0 flex-col border-l max-[820px]:border-t max-[820px]:border-l-0">
          <Tabs value={tab} onValueChange={value => setState({ tab: value as Tab })} className="min-h-0 flex-1 gap-0">
            <div className="border-b px-4 pt-2">
              <TabsList variant="line" aria-label="Panel" className="h-9">
                {TABS.map(([key, label]) => (
                  <TabsTrigger key={key} value={key} aria-controls="panel-body" className="px-2">
                    {label}
                    {key === 'tareas' && open > 0 && <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-route px-1 text-[10px] text-white">{open}</span>}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm max-[820px]:overflow-visible" id="panel-body" role="tabpanel">
              {tab === 'anomalias' && <AnomalyList twin={twin} feedback={feedback} lossKg={lossKg} />}
              {tab === 'olivo' && <TreeCard twin={twin} feedback={feedback} lossKg={lossKg} />}
              {tab === 'tareas' && <TaskPanel twin={twin} feedback={feedback} />}
            </div>
          </Tabs>
          <footer className="flex items-center gap-2 border-t py-1.5 pr-2 pl-4">
            <p className="flex-1 text-[11px] text-muted-foreground">Finca simulada a partir de una semilla.</p>
            <Assumptions />
          </footer>
        </aside>
      </main>
    </div>
  );
}

export default function App() {
  const [twin, setTwin] = useState<Twin | null>(null);
  useEffect(() => {
    // Let the loading screen paint before building 15,000 trees.
    const id = setTimeout(() => setTwin(getTwin()), 30);
    return () => clearTimeout(id);
  }, []);
  if (!twin) {
    return (
      <div className="grid h-dvh place-content-center gap-1 text-center text-sm text-muted-foreground" role="status">
        <p className="font-medium text-foreground">MiOlivo</p>
        <p>Cargando la finca, olivo a olivo…</p>
      </div>
    );
  }
  return <Workspace twin={twin} />;
}
