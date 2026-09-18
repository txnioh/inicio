export const expressions = [
  { value: 'idle', label: 'curioso' }, { value: 'wink', label: 'guiño' },
  { value: 'happy', label: 'alegre' }, { value: 'surprised', label: 'sorpresa' },
  { value: 'sleeping', label: 'dormido' }, { value: 'music', label: 'bailando' },
  { value: 'carried', label: 'gotitas' },
] as const;
export const movements = [
  { value: 'still', label: 'quieto' }, { value: 'slide', label: 'deslizar' },
  { value: 'hop', label: 'saltar' }, { value: 'portal', label: 'agujero' },
  { value: 'shake', label: 'temblar' }, { value: 'spin', label: 'girar' },
] as const;
export const easings = [
  { value: 'ease-in-out', label: 'suave' }, { value: 'ease-out', label: 'frenar al llegar' },
  { value: 'linear', label: 'constante' },
] as const;

export type RobotStep = {
  id: string;
  name: string;
  expression: typeof expressions[number]['value'];
  movement: typeof movements[number]['value'];
  easing: typeof easings[number]['value'];
  x: number;
  y: number;
  angle: number;
  scale: number;
  duration: number;
  hold: number;
  intensity: number;
  text: string;
  speechDelay: number;
  letterDelay: number;
};
export type RobotProject = { version: 1; name: string; loop: boolean; steps: RobotStep[] };
export const MAX_STEPS = 24;
let nextId = 0;

export function makeStep(values: Partial<Omit<RobotStep, 'id'>> = {}): RobotStep {
  return {
    name: 'nuevo gesto', expression: 'idle', movement: 'slide', easing: 'ease-in-out',
    x: 50, y: 65, angle: 0, scale: 3, duration: 700, hold: 1400, intensity: 35,
    text: '', speechDelay: 240, letterDelay: 24,
    ...values, id: `step-${++nextId}`,
  };
}

export const presets = [
  { name: 'hola, mundo', description: 'un saludo y una pequeña excursión', create: (): RobotProject => ({
    version: 1, name: 'hola, mundo', loop: false, steps: [
      makeStep({ name: 'aparecer', movement: 'portal', expression: 'happy', x: 28, y: 62, text: 'hola, ¿qué vamos a inventar?', duration: 900, hold: 1700, speechDelay: 800 }),
      makeStep({ name: 'dar un saltito', movement: 'hop', expression: 'surprised', x: 72, y: 50, text: 'por aquí.', duration: 850, hold: 1000 }),
      makeStep({ name: 'guiñar', movement: 'still', expression: 'wink', x: 72, y: 50, text: 'queda entre nosotros.', hold: 1500 }),
      makeStep({ name: 'volver', movement: 'portal', x: 50, y: 65, duration: 1000, hold: 700 }),
    ],
  }) },
  { name: 'pequeño guía', description: 'aparecer, explicar y volver', create: (): RobotProject => ({
    version: 1, name: 'pequeño guía', loop: false, steps: [
      makeStep({ name: 'salir al encuentro', movement: 'portal', x: 72, y: 55, expression: 'happy', duration: 850, hold: 2200, text: 'aquí pasan cosas interesantes.', speechDelay: 800 }),
      makeStep({ name: 'esperar un poquito', movement: 'still', x: 72, y: 55, duration: 200, hold: 500 }),
      makeStep({ name: 'hasta luego', movement: 'portal', x: 30, y: 65, duration: 1100, hold: 600 }),
    ],
  }) },
  { name: 'mini disco', description: 'notas, baile y una vuelta', create: (): RobotProject => ({
    version: 1, name: 'mini disco', loop: true, steps: [
      makeStep({ name: 'a la pista', movement: 'hop', expression: 'music', x: 35, text: 'esta me gusta.', hold: 1900 }),
      makeStep({ name: 'una vuelta', movement: 'spin', expression: 'music', x: 65, duration: 1400, hold: 1400, intensity: 18 }),
      makeStep({ name: 'otra más', movement: 'slide', expression: 'music', x: 35, duration: 1000, hold: 1800 }),
    ],
  }) },
  { name: 'cinco minutitos', description: 'dormir, despertar y llevarse un susto', create: (): RobotProject => ({
    version: 1, name: 'cinco minutitos', loop: false, steps: [
      makeStep({ name: 'siestecita', movement: 'still', expression: 'sleeping', text: 'just resting my pixels.', hold: 2500 }),
      makeStep({ name: '¿ya?', movement: 'shake', expression: 'carried', duration: 900, hold: 1200, intensity: 9, text: 'uy, qué susto.' }),
      makeStep({ name: 'todo bien', movement: 'still', expression: 'happy', hold: 1600, text: 'yo no estaba durmiendo.' }),
    ],
  }) },
];

export const sequenceDuration = (steps: RobotStep[]) => steps.reduce((total, step) => total + step.duration + step.hold, 0);
export const stepStart = (steps: RobotStep[], index: number) => sequenceDuration(steps.slice(0, index));
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number, easing: RobotStep['easing']) => easing === 'linear' ? t : easing === 'ease-out' ? 1 - (1 - t) ** 3 : t * t * (3 - 2 * t);

export function sampleSequence(steps: RobotStep[], elapsed: number, reducedMotion: boolean) {
  let index = 0;
  let local = Math.max(0, elapsed);
  while (index < steps.length - 1 && local >= steps[index].duration + steps[index].hold) {
    local -= steps[index].duration + steps[index].hold;
    index += 1;
  }
  const step = steps[index];
  const previous = index ? steps[index - 1] : { x: 50, y: 65, angle: 0, scale: 3 };
  const t = reducedMotion ? 1 : clamp(local / step.duration);
  const eased = ease(t, step.easing);
  const instant = step.movement === 'still' || reducedMotion;
  let x = mix(previous.x, step.x, instant ? 1 : eased);
  let y = mix(previous.y, step.y, instant ? 1 : eased);
  let angle = mix(previous.angle, step.angle, instant ? 1 : eased);
  let scale = mix(previous.scale, step.scale, instant ? 1 : eased);
  let lift = 0;
  let offsetX = 0;
  const portal = step.movement === 'portal' && t < 1;
  const portalOut = t < .5;
  const portalProgress = ease(portalOut ? clamp(t / .42) : clamp((t - .58) / .42), step.easing);
  if (portal) {
    const point = portalOut ? previous : step;
    x = point.x; y = point.y; angle = point.angle; scale = point.scale;
  } else if (!reducedMotion) {
    if (step.movement === 'hop') lift = -Math.sin(Math.PI * t) * step.intensity;
    if (step.movement === 'spin') angle += eased * 360;
    if (step.movement === 'shake') offsetX = Math.sin(t * Math.PI * 12) * Math.sin(t * Math.PI) * step.intensity / 3;
  }
  return { index, step, local, x, y, angle, scale, lift, offsetX, portal, portalOut, portalProgress };
}

export function readProject(source: string): RobotProject {
  const data: unknown = JSON.parse(source);
  if (!data || typeof data !== 'object') throw new Error('Ese archivo no es una animación del bot.');
  const project = data as Record<string, unknown>;
  if (project.version !== 1 || typeof project.name !== 'string' || typeof project.loop !== 'boolean'
    || !Array.isArray(project.steps) || !project.steps.length || project.steps.length > MAX_STEPS) {
    throw new Error('Usa un archivo exportado desde bot lab, con entre 1 y 24 pasos.');
  }
  const steps = project.steps.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Hay un paso que no se puede leer.');
    const step = value as Record<string, unknown>;
    const numeric = (key: string, min: number, max: number) => {
      const n = step[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`El valor de ${key} está fuera de rango.`);
      return n;
    };
    if (!expressions.some(option => option.value === step.expression)
      || !movements.some(option => option.value === step.movement)
      || !easings.some(option => option.value === step.easing)
      || typeof step.name !== 'string' || typeof step.text !== 'string') {
      throw new Error('Hay un gesto o movimiento que este lab no reconoce.');
    }
    return makeStep({
      name: step.name.slice(0, 40), text: step.text.toLocaleLowerCase().slice(0, 120),
      expression: step.expression as RobotStep['expression'], movement: step.movement as RobotStep['movement'], easing: step.easing as RobotStep['easing'],
      x: numeric('x', 0, 100), y: numeric('y', 0, 100), angle: numeric('angle', -180, 180), scale: numeric('scale', 1, 5),
      duration: numeric('duration', 100, 4000), hold: numeric('hold', 0, 5000), intensity: numeric('intensity', 0, 80),
      speechDelay: numeric('speechDelay', 0, 2000), letterDelay: numeric('letterDelay', 10, 80),
    });
  });
  return { version: 1, name: project.name.slice(0, 80), loop: project.loop, steps };
}
