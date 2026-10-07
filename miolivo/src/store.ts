import { useSyncExternalStore } from 'react';
import { ANOMALY_INFO, analyze, type Twin } from './model/analyze.ts';
import { DEFAULT_ASSUMPTIONS, type Assumptions } from './model/economics.ts';
import { generateFarm } from './model/generate.ts';
import { planRoute, taskHours } from './model/route.ts';
import type { AnomalyType, CampaignIndex, Outcome, Task, TaskType } from './model/types.ts';

export type Layer = 'estado' | 'vigor' | 'estres' | 'copa' | 'perdida';
export type Basemap = 'foto' | 'plano';
export type Tab = 'anomalias' | 'olivo' | 'tareas';
export type Focus = { minX: number; minY: number; maxX: number; maxY: number; nonce: number };
export type Draft = { type: TaskType; anomaly?: AnomalyType };

export type State = {
  campaign: CampaignIndex;
  layer: Layer;
  basemap: Basemap;
  /** Olives as 3D models under a tilted camera. */
  threeD: boolean;
  tab: Tab;
  /** The tree whose card is open. */
  tree: number | null;
  /** Trees picked for a task, sorted. */
  selection: number[];
  draft: Draft | null;
  tasks: Task[];
  activeTask: string | null;
  assumptions: Assumptions;
  focus: Focus | null;
};

export const TASK_LABEL: Record<TaskType, string> = {
  inspeccion: 'Inspección',
  poda: 'Poda',
  riego: 'Revisión de riego',
  tratamiento: 'Tratamiento',
};

const STORAGE_KEY = 'miolivo:v1';
const SEED = 2026;

let twin: Twin | null = null;
export function getTwin() {
  twin ??= analyze(generateFarm(SEED));
  return twin;
}

function restore(): Partial<State> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return {};
    return {
      tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
      assumptions: { ...DEFAULT_ASSUMPTIONS, ...saved.assumptions },
      layer: saved.layer ?? 'estado',
      basemap: saved.basemap === 'plano' ? 'plano' : 'foto',
      threeD: saved.threeD === true,
    };
  } catch {
    return {};
  }
}

let state: State = {
  campaign: 2,
  layer: 'estado',
  basemap: 'foto',
  threeD: false,
  tab: 'anomalias',
  tree: null,
  selection: [],
  draft: null,
  tasks: [],
  activeTask: null,
  assumptions: DEFAULT_ASSUMPTIONS,
  focus: null,
  ...(typeof localStorage === 'undefined' ? {} : restore()),
};

const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, assumptions: state.assumptions, layer: state.layer, basemap: state.basemap, threeD: state.threeD }));
  } catch {
    // Private windows and full storage: the session still works, it just won't remember.
  }
}

export function setState(patch: Partial<State> | ((current: State) => Partial<State>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  if (['tasks', 'assumptions', 'layer', 'basemap', 'threeD'].some(key => key in next)) persist();
  listeners.forEach(listener => listener());
}

export const getState = () => state;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** `select` must return something already in the state (or a primitive), not a new object. */
export function useStore<T>(select: (current: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export function boundsOf(indices: number[], padding = 30) {
  const { trees } = getTwin().farm;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of indices) {
    const t = trees[i];
    minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x); maxY = Math.max(maxY, t.y);
  }
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

export const focusOn = (indices: number[], padding?: number) => {
  if (indices.length) setState({ focus: { ...boundsOf(indices, padding), nonce: Math.random() } });
};

export const openTree = (index: number | null) => setState(index === null ? { tree: null } : { tree: index, tab: 'olivo' });

export function select(indices: number[], mode: 'replace' | 'add' | 'toggle' = 'replace') {
  setState(current => {
    const set = new Set(mode === 'replace' ? [] : current.selection);
    for (const i of indices) {
      if (mode === 'toggle' && set.has(i)) set.delete(i);
      else set.add(i);
    }
    return { selection: [...set].sort((a, b) => a - b) };
  });
}

export function createTask(type: TaskType, indices: number[], anomaly?: AnomalyType) {
  const { farm } = getTwin();
  const points = indices.map(i => farm.trees[i]);
  const { order, length } = planRoute(farm.gate, points);
  const route = order.map(k => indices[k]);
  const intensive = route.filter(i => farm.plots[farm.trees[i].plot].system === 'intensivo').length;
  const title = `${TASK_LABEL[type]} · ${indices.length === 1 ? `olivo ${farm.trees[indices[0]].id}` : `${indices.length} olivos`}${anomaly ? ` · ${ANOMALY_INFO[anomaly].short.toLowerCase()}` : ''}`;
  const task: Task = {
    id: `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    type,
    title,
    createdAt: new Date().toISOString(),
    campaign: state.campaign,
    route,
    distanceM: length,
    hours: taskHours(type, length, route.length - intensive, intensive),
    done: false,
    results: {},
    anomaly,
  };
  setState(current => ({ tasks: [task, ...current.tasks], activeTask: task.id, tab: 'tareas', draft: null, selection: [] }));
  focusOn(route);
  return task;
}

export function updateTask(id: string, change: (task: Task) => Task) {
  setState(current => ({ tasks: current.tasks.map(task => (task.id === id ? change(task) : task)) }));
}

export const setOutcome = (id: string, tree: number, outcome: Outcome) =>
  updateTask(id, task => ({ ...task, results: { ...task.results, [tree]: outcome } }));

export const deleteTask = (id: string) =>
  setState(current => ({ tasks: current.tasks.filter(task => task.id !== id), activeTask: current.activeTask === id ? null : current.activeTask }));
