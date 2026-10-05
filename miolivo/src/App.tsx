import { useEffect, useMemo, useState } from 'react';
import { colourTrees, type Theme } from './colors.ts';
import AnomalyList from './components/AnomalyList.tsx';
import FarmMap from './components/FarmMap.tsx';
import { LayerBar, Legend, TimeSlider } from './components/MapControls.tsx';
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
    return () => query.removeEventListener('change', update);
  }, [query]);
  return dark ? 'dark' : 'light';
}

const TABS: [Tab, string][] = [['anomalias', 'Anomalías'], ['olivo', 'Olivo'], ['tareas', 'Tareas']];

function Assumptions() {
  const assumptions = useStore(s => s.assumptions);
  const set = (key: keyof typeof assumptions, value: number) => {
    if (Number.isFinite(value) && value > 0) setState({ assumptions: { ...assumptions, [key]: value } });
  };
  return (
    <details className="assumptions">
      <summary>Supuestos económicos</summary>
      <label>Rendimiento graso <span><input type="number" min={5} max={35} step={0.5} value={Math.round(assumptions.oilYield * 1000) / 10} onChange={e => set('oilYield', Number(e.target.value) / 100)} /> %</span></label>
      <label>Precio del aceite en origen <span><input type="number" min={1} max={15} step={0.1} value={assumptions.oilPrice} onChange={e => set('oilPrice', Number(e.target.value))} /> €/kg</span></label>
      <p>La pérdida es la diferencia entre lo que daría el olivo al ritmo de su entorno sano y lo que da o se prevé, solo en olivos con anomalía. € = kg de aceituna × rendimiento × precio.</p>
      <button type="button" className="button is-quiet" onClick={() => setState({ assumptions: DEFAULT_ASSUMPTIONS })}>Restablecer</button>
    </details>
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

  return (
    <div className="app">
      <Summary twin={twin} feedback={feedback} lossKg={totalLoss} />
      <main className="workspace">
        <section className="map-area" aria-label="Mapa de la finca">
          <FarmMap twin={twin} theme={theme} colours={colours} anomalies={feedback.anomalies} status={feedback.status} lossKg={lossKg} selectMode={selectMode} />
          <div className="map-top">
            <LayerBar />
            <button type="button" className={`tool${selectMode ? ' is-on' : ''}`} aria-pressed={selectMode} onClick={() => setSelectMode(on => !on)}>
              Seleccionar área
            </button>
          </div>
          {selection.length > 0 && (
            <div className="selection-bar" role="status">
              <span><strong>{plural(selection.length, 'olivo seleccionado', 'olivos seleccionados')}</strong>{selectionLoss > 0 && <> · pérdida estimada {eur(euros(selectionLoss, assumptions))}</>}</span>
              <button type="button" className="button is-primary is-small" onClick={() => setState({ tab: 'tareas' })}>Crear tarea</button>
              <button type="button" className="button is-quiet is-small" onClick={() => { select([]); setState({ draft: null }); }}>Limpiar</button>
            </div>
          )}
          <div className="map-bottom">
            <TimeSlider />
            <Legend theme={theme} />
          </div>
        </section>
        <aside className="panel">
          <nav className="tabs" role="tablist" aria-label="Panel">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls="panel-body" onClick={() => setState({ tab: key })}>
                {label}
                {key === 'tareas' && tasks.some(t => !t.done) && <span className="count">{tasks.filter(t => !t.done).length}</span>}
              </button>
            ))}
          </nav>
          <div className="panel-body" id="panel-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === 'anomalias' && <AnomalyList twin={twin} feedback={feedback} lossKg={lossKg} />}
            {tab === 'olivo' && <TreeCard twin={twin} feedback={feedback} lossKg={lossKg} />}
            {tab === 'tareas' && <TaskPanel twin={twin} feedback={feedback} />}
          </div>
          <footer className="panel-footer">
            <Assumptions />
            <p className="disclaimer">Finca simulada con fines de demostración: los olivos, las mediciones y las cosechas se generan a partir de una semilla.</p>
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
      <div className="loading" role="status">
        <p><strong>MiOlivo</strong></p>
        <p>Cargando la finca, olivo a olivo…</p>
      </div>
    );
  }
  return <Workspace twin={twin} />;
}
