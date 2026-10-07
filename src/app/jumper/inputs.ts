import type { Fsm } from './controller';

export interface InputEdge { device: 'key' | 'pad'; code: string; down: boolean; repeat: boolean }
interface Binding { name: string; pad?: string; on: string; with?: string; from?: string[] }

export function modeBinding(fsm: Pick<Fsm, 'bindings' | 'mode'>, requested: string) {
  const current = fsm.mode();
  const bindings: Binding[] = JSON.parse(fsm.bindings());
  // letGo centres manual controls; it does not release a mode's toggle latch.
  // Press that mode's own original switch again to return to locomotion.
  const name = requested === 'locomotion' ? current : requested;
  return bindings.find(b => b.name === name && b.pad && b.on === 'toggle'
    && (name === current || !b.from || b.from.includes(current)));
}

export function queueMode(fsm: Pick<Fsm, 'bindings' | 'mode'>, requested: string, queue: InputEdge[]) {
  const binding = modeBinding(fsm, requested);
  if (!binding) return false;
  const pad = (code: string, down: boolean) => queue.push({ device: 'pad', code, down, repeat: false });
  // Fresh press, then release, on separate controller ticks. No wall-clock timer
  // can shorten a chord or leave a button stuck when simulation is paused.
  if (binding.with) pad(binding.with, false);
  pad(binding.pad!, false);
  if (binding.with) pad(binding.with, true);
  pad(binding.pad!, true);
  pad(binding.pad!, false);
  if (binding.with) pad(binding.with, false);
  return true;
}

export function flushInputs(fsm: Fsm, queue: InputEdge[], nowUs: number) {
  const seen = new Set<string>();
  while (queue.length) {
    const event = queue[0], token = `${event.device}:${event.code}`;
    if (seen.has(token)) break;
    seen.add(token); queue.shift();
    if (event.device === 'key') fsm.setKeyCode(event.code, event.down, event.repeat, nowUs);
    else { fsm.setPad(event.code, event.down); fsm.padFrame(nowUs); }
  }
}
