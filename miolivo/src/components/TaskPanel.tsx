import { ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ANOMALY_INFO, type Twin } from '../model/analyze.ts';
import { simulateVisit, type Feedback } from '../model/feedback.ts';
import type { Outcome, Task, TaskType } from '../model/types.ts';
import { dec, int, plural } from '../format.ts';
import { createTask, deleteTask, focusOn, openTree, select, setOutcome, setState, TASK_LABEL, updateTask, useStore } from '../store.ts';

const TYPES = Object.keys(TASK_LABEL) as TaskType[];

function Draft() {
  const selection = useStore(s => s.selection);
  const draft = useStore(s => s.draft);
  const [type, setType] = useState<TaskType>(draft?.type ?? 'inspeccion');
  const chosen = draft?.type ?? type;
  if (!selection.length) {
    return (
      <p className="text-muted-foreground">
        Selecciona olivos para crear una tarea: desde una anomalía, con <kbd>Mayús</kbd> + arrastrar en el mapa
        o con el botón de selección.
      </p>
    );
  }
  return (
    <form className="grid gap-3 rounded-xl border p-3" onSubmit={event => { event.preventDefault(); createTask(chosen, selection, draft?.anomaly); }}>
      <p className="text-[13px]"><span className="font-medium">{plural(selection.length, 'olivo seleccionado', 'olivos seleccionados')}</span>{draft?.anomaly && <span className="text-muted-foreground"> · {ANOMALY_INFO[draft.anomaly].label}</span>}</p>
      <ToggleGroup
        type="single"
        value={chosen}
        onValueChange={value => { if (!value) return; const key = value as TaskType; setType(key); setState(s => ({ draft: s.draft ? { ...s.draft, type: key } : null })); }}
        aria-label="Tipo de tarea"
        variant="outline"
        spacing={1}
        className="flex-wrap"
      >
        {TYPES.map(key => <ToggleGroupItem key={key} value={key} size="sm" className="rounded-full px-2.5 text-xs">{TASK_LABEL[key]}</ToggleGroupItem>)}
      </ToggleGroup>
      <div className="flex gap-2">
        <Button type="submit">Crear tarea y ruta</Button>
        <Button type="button" variant="ghost" onClick={() => { select([]); setState({ draft: null }); }}>Cancelar</Button>
      </div>
    </form>
  );
}

function TaskItem({ task, twin, active }: { task: Task; twin: Twin; active: boolean }) {
  const visited = Object.keys(task.results).length;
  const confirmed = Object.values(task.results).filter(o => o === 'confirmado').length;
  const toggle = () => {
    setState({ activeTask: active ? null : task.id });
    if (!active) focusOn(task.route);
  };
  const fillFromField = () => {
    const results: Record<number, Outcome> = {};
    for (const i of task.route) results[i] = simulateVisit(twin.farm.trees[i], task.anomaly);
    updateTask(task.id, t => ({ ...t, results }));
  };

  return (
    <li className={`rounded-xl border ${active ? 'border-foreground/20 bg-muted/30' : ''}`}>
      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={active} onClick={toggle}>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={`truncate font-medium ${task.done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''}`}>{task.title}</span>
          <span className="text-xs text-muted-foreground">
            {task.done ? `Hecha · ${int(confirmed)} de ${int(task.route.length)} confirmados` : `${dec(task.distanceM / 1000, 1)} km · ${dec(task.hours, 1)} h`}
          </span>
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${active ? 'rotate-180' : ''}`} />
      </button>
      {active && (
        <div className="grid gap-3 px-3 pb-3">
          <ol className="grid max-h-72 divide-y overflow-y-auto border-y">
            {task.route.map((i, k) => {
              const tree = twin.farm.trees[i];
              const outcome = task.results[i];
              return (
                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <button type="button" className="inline-flex items-center gap-2 text-[13px] hover:underline" onClick={() => { openTree(i); focusOn([i], 25); setState({ tab: 'tareas' }); }}>
                    <span className="inline-grid size-5 place-items-center rounded-full bg-route text-[10px] text-white">{k + 1}</span>Olivo {tree.id}
                  </button>
                  {!task.done ? (
                    <ToggleGroup
                      type="single"
                      value={outcome ?? ''}
                      onValueChange={value => value && setOutcome(task.id, i, value as Outcome)}
                      aria-label={`Resultado del olivo ${tree.id}`}
                      variant="outline"
                      spacing={0}
                    >
                      <ToggleGroupItem value="confirmado" size="sm" className="h-6 px-2 text-[11px] data-[state=on]:bg-bad data-[state=on]:text-white">Confirmado</ToggleGroupItem>
                      <ToggleGroupItem value="falso" size="sm" className="h-6 px-2 text-[11px] data-[state=on]:bg-ok data-[state=on]:text-white">Sin problema</ToggleGroupItem>
                    </ToggleGroup>
                  ) : (
                    <span className={`text-xs ${outcome === 'confirmado' ? 'text-bad' : outcome === 'falso' ? 'text-ok' : 'text-muted-foreground'}`}>
                      {outcome === 'confirmado' ? 'Confirmado' : outcome === 'falso' ? 'Sin problema' : 'Sin visitar'}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap gap-2">
            {!task.done && (
              <>
                <Button size="sm" disabled={!visited} onClick={() => updateTask(task.id, t => ({ ...t, done: true, completedAt: new Date().toISOString() }))}>
                  Marcar hecha · {int(visited)}/{int(task.route.length)}
                </Button>
                <Button size="sm" variant="outline" onClick={fillFromField} title="La finca es simulada: rellena los resultados con lo que habría encontrado un técnico">
                  Simular visita
                </Button>
              </>
            )}
            <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Eliminar tarea" title="Eliminar" onClick={() => deleteTask(task.id)}><Trash2 /></Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function TaskPanel({ twin, feedback }: { twin: Twin; feedback: Feedback }) {
  const tasks = useStore(s => s.tasks);
  const activeTask = useStore(s => s.activeTask);
  const learned = Object.entries(feedback.precision);

  return (
    <div className="grid gap-4">
      <Draft />
      {tasks.length > 0 && (
        <ol className="grid gap-2">
          {tasks.map(task => <TaskItem key={task.id} task={task} twin={twin} active={task.id === activeTask} />)}
        </ol>
      )}
      {learned.length > 0 && (
        <section className="grid gap-2 rounded-xl bg-muted/50 p-3 text-[13px]">
          <h3 className="font-medium">Lo que ha aprendido el gemelo</h3>
          <p className="text-muted-foreground">Los falsos positivos dejan de señalarse en ese olivo. La precisión de cada diagnóstico se mide con lo que se encuentra en campo:</p>
          <ul className="grid gap-1">
            {learned.map(([type, p]) => (
              <li key={type}>
                {ANOMALY_INFO[type as keyof typeof ANOMALY_INFO].short}: <strong>{int((p!.confirmed / p!.checked) * 100)} %</strong> confirmado ({int(p!.confirmed)} de {int(p!.checked)})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
