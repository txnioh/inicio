// Station sounds in 8 bits, made on the fly with Web Audio: the PA's
// "ding-dong" when a train starts boarding, a three-note one for your own
// train, and the dry click of a signal relay. Off until the visitor turns it
// on, which also counts as the gesture browsers want before playing audio.
let context: AudioContext | null = null;
let enabled = false;
const last = { chime: -Infinity, click: -Infinity };

export function setSound(on: boolean) {
  enabled = on;
  if (!on) {
    void context?.suspend();
    return;
  }
  context ??= new AudioContext();
  void context.resume();
}

function tone(frequency: number, start: number, length: number, volume = .05) {
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = frequency;
  const at = context.currentTime + start;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, at + length);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + length + .02);
}

// At the faster clock speeds events bunch up; keep a little air between them.
function ready(kind: keyof typeof last, gap: number) {
  if (!enabled || !context) return false;
  const now = performance.now();
  if (now - last[kind] < gap) return false;
  last[kind] = now;
  return true;
}

export function chime(mine = false) {
  if (!ready('chime', mine ? 0 : 2500)) return;
  if (mine) {
    tone(784, 0, .28);
    tone(659, .22, .28);
    tone(523, .44, .6);
  } else {
    tone(659, 0, .34);
    tone(523, .3, .7);
  }
}

// A quick "hurry" double blip, for when it's time to leave for your train.
export function nudge() {
  if (!ready('chime', 0)) return;
  tone(880, 0, .07, .04);
  tone(880, .11, .07, .04);
}

export function click() {
  if (!ready('click', 180) || !context) return;
  const length = Math.floor(context.sampleRate * .012);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = .12;
  source.buffer = buffer;
  source.connect(gain).connect(context.destination);
  source.start();
}
