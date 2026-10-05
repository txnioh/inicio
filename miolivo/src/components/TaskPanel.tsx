import { useState } from 'react';
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
      <p className="hint">
        Selecciona olivos para crear una tarea: desde una anomalía, con <kbd>Mayús</kbd> + arrastrar en el mapa
        o con el botón <em>Seleccionar área</em>.
      </p>
    );
  }
  return (
    <form className="draft" onSubmit={event => { event.preventDefault(); createTask(chosen, selection, draft?.anomaly); }}>
      <p><strong>{plural(selection.length, 'olivo seleccionado', 'olivos seleccionados')}</strong>{draft?.anomaly && <> · {ANOMALY_INFO[draft.anomaly].label}</>}</p>
      <div className="segmented" role="radiogroup" aria-label="Tipo de tarea">
        {TYPES.map(key => (
          <button key={key} type="button" role="radio" aria-checked={chosen === key} onClick={() => { setType(key); setState(s => ({ draft: s.draft ? { ...s.draft, type: key } : null })); }}>
            {TASK_LABEL[key]}
          </button>
        ))}
      </div>
      <div className="draft-actions">
        <button type="submit" className="button is-primary">Crear tarea y ruta</button>
        <button type="button" className="button is-quiet" onClick={() => { select([]); setState({ draft: null }); }}>Cancelar</button>
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
    <li className={`task${active ? ' is-active' : ''}${task.done ? ' is-done' : ''}`}>
      <button type="button" className="task-main" aria-expanded={active} onClick={toggle}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {task.done ? `Hecha · ${int(confirmed)} de ${int(task.route.length)} confirmados` : `Ruta de ${dec(task.distanceM / 1000, 1)} km · ${dec(task.hours, 1)} h estimadas`}
        </span>
      </button>
      {active && (
        <div className="task-body">
          <ol className="route-list">
            {task.route.map((i, k) => {
              const tree = twin.farm.trees[i];
              const outcome = task.results[i];
              return (
                <li key={i}>
                  <button type="button" className="route-tree" onClick={() => { openTree(i); focusOn([i], 25); setState({ tab: 'tareas' }); }}>
                    <span className="route-step">{k + 1}</span>Olivo {tree.id}
                  </button>
                  {!task.done ? (
                    <span className="outcome" role="group" aria-label={`Resultado del olivo ${tree.id}`}>
                      <button type="button" aria-pressed={outcome === 'confirmado'} onClick={() => setOutcome(task.id, i, 'confirmado')}>Confirmado</button>
                      <button type="button" aria-pressed={outcome === 'falso'} onClick={() => setOutcome(task.id, i, 'falso')}>Sin problema</button>
                    </span>
                  ) : (
                    <span className={`outcome-label is-${outcome ?? 'none'}`}>{outcome === 'confirmado' ? 'Confirmado' : outcome === 'falso' ? 'Sin problema' : 'Sin visitar'}</span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="task-actions">
            {!task.done && (
              <>
                <button type="button" className="button" onClick={fillFromField} title="La finca es simulada: rellena los resultados con lo que habría encontrado un técnico">
                  Simular visita de campo
                </button>
                <button
                  type="button"
                  className="button is-primary"
                  disabled={!visited}
                  onClick={() => updateTask(task.id, t => ({ ...t, done: true, completedAt: new Date().toISOString() }))}
                >
                  Marcar como hecha ({int(visited)}/{int(task.route.length)})
                </button>
              </>
            )}
            <button type="button" className="button is-quiet" onClick={() => deleteTask(task.id)}>Eliminar</button>
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
    <div className="tasks">
      <Draft />
      {tasks.length > 0 && (
        <ol className="task-list">
          {tasks.map(task => <TaskItem key={task.id} task={task} twin={twin} active={task.id === activeTask} />)}
        </ol>
      )}
      {learned.length > 0 && (
        <section className="learned">
          <h3>Lo que ha aprendido el gemelo</h3>
          <p>Los falsos positivos dejan de señalarse en ese olivo. La precisión de cada diagnóstico se mide con lo que se encuentra en campo:</p>
          <ul>
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
