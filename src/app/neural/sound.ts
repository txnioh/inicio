import type { TrainingRecording } from './render';

export const SAMPLE_RATE = 48000;

/** Original, deterministic chiptune effects, timed to the visual events.
 * No reference audio, music, or external sound samples are included.
 */
export function renderSoundtrack(recording: TrainingRecording) {
  const samples = new Float32Array(recording.traces.length * 8 * SAMPLE_RATE);
  let seed = 73;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 2147483648 - 1;
  };
  function tone(at: number, length: number, from: number, to: number, volume: number, kind: 'pulse' | 'bell' | 'noise' = 'pulse') {
    const offset = Math.round(at * SAMPLE_RATE);
    const count = Math.round(length * SAMPLE_RATE);
    let phase = 0;
    let filtered = 0;
    for (let i = 0; i < count && offset + i < samples.length; i++) {
      const t = i / count;
      const frequency = from * (to / from) ** t;
      phase += frequency / SAMPLE_RATE;
      const sine = Math.sin(phase * Math.PI * 2);
      const triangle = 1 - 4 * Math.abs(Math.round(phase) - phase);
      let wave = kind === 'bell' ? sine * .8 + Math.sin(phase * Math.PI * 4) * .2
        : Math.sign(sine) * .38 + triangle * .62;
      if (kind === 'noise') wave = wave * .5 + noise() * .5;
      // A small low-pass softens aliasing without removing the square-wave texture.
      filtered += .3 * (wave - filtered);
      const envelope = Math.min(1, i / (SAMPLE_RATE * .003)) * Math.exp(-5 * t) * Math.min(1, (1 - t) * 20);
      samples[offset + i] += Math.round(filtered * 96) / 96 * envelope * volume;
    }
  }

  recording.traces.forEach((trace, sample) => {
    const at = sample * 8;
    // Readout: little pitched taps follow the input scan and moving packets.
    for (let i = 0; i < 14; i++) {
      const brightness = trace.pixels[trace.inputIndices[i]] / 255;
      tone(at + 1.01 + i * .036, .10, 800 + brightness * 1000, 120 + i * 13, .045 + brightness * .025);
    }
    trace.activations.slice(1).forEach((values, layer) => {
      const max = Math.max(...values, .00001);
      values.forEach((value, i) => {
        const activity = Math.sqrt(value / max);
        if (activity < .13) return;
        tone(at + 1.53 + layer * .62 + i / values.length * .34, .14,
          650 + layer * 170 + i * 37, 110 + layer * 45, .06 * activity);
      });
      tone(at + 1.98 + layer * .62, .27, 720 + layer * 140, 140, .11, 'pulse');
    });
    // The result resolves in short, ascending octave tones.
    [415.3, 622.25, 830.6, 1661.2].forEach((pitch, i) => {
      tone(at + 3.23 + i * .075, .16, pitch, pitch * .985, .085, 'bell');
    });
    // Error/gradient pulses move right to left with a lower, falling pitch.
    tone(at + 3.98, .42, 480, 80, .16, 'noise');
    [4.38, 4.98, 5.52, 6.02].forEach((time, layer) => {
      tone(at + time, .28, 430 - layer * 60, 80 - layer * 11, .15, 'pulse');
      for (let i = 0; i < 3; i++) {
        tone(at + time + i * .055, .07, 1000 - layer * 140 + i * 90, 170, .025, 'noise');
      }
    });
    [1568, 2349, 2637].forEach((pitch, i) => tone(at + 6.43 + i * .065, .15, pitch, pitch * 1.025, .035, 'bell'));
  });
  // Keep headroom even when many active neurons coincide.
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh(samples[i] * 6.4) * .7;
  return samples;
}

export function createNeuralAudio(recording: TrainingRecording) {
  return createAudioPlayer(renderSoundtrack(recording));
}

export function diffusionSoundtrack(caption: string) {
  const pcm = new Float32Array(24 * SAMPLE_RATE);
  function blip(at: number, frequency: number, duration: number, volume: number) {
    const start = Math.round(at * SAMPLE_RATE);
    let phase = 0;
    for (let i = 0; i < duration * SAMPLE_RATE; i++) {
      const t = i / (duration * SAMPLE_RATE);
      phase += frequency * Math.exp(-t * 2.5) / SAMPLE_RATE;
      const wave = Math.sin(phase * Math.PI * 2) * .6 + Math.sign(Math.sin(phase * Math.PI * 2)) * .4;
      pcm[start + i] += wave * Math.min(1, i / 100) * Math.exp(-t * 7) * volume;
    }
  }
  [...caption.slice(0, 39)].forEach((c, i) => blip(.2 + i / Math.max(1, caption.length) * 2.3, 1000 + c.charCodeAt(0) % 12 * 75, .045, .045));
  blip(2.6, 650, .24, .22); blip(2.78, 1230, .18, .18);
  for (let step = 0; step < 10; step++) {
    const at = 3.2 + step * 1.65;
    for (let l = 0; l < 7; l++) blip(at + l * .115, 950 + l * 125, .07, .018);
    blip(at + 1.25, 420 - step * 12, .18, .18);
    blip(at + 1.43, 730, .11, .08);
  }
  [659, 988, 1318].forEach((f, i) => blip(20 + i * .11, f, .3, .13));
  return pcm;
}

export function createAudioPlayer(pcm: Float32Array) {
  const context = new AudioContext();
  const buffer = context.createBuffer(1, pcm.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(pcm);
  const gain = context.createGain();
  gain.gain.value = .8;
  gain.connect(context.destination);
  let source: AudioBufferSourceNode | null = null;
  let startTime = 0;
  let offset = 0;
  let speed = 1;
  function stop() {
    source?.stop();
    source?.disconnect();
    source = null;
  }
  return {
    resume: () => context.resume(),
    start(time: number, playbackRate: number) {
      stop();
      source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = playbackRate;
      source.connect(gain);
      offset = time % buffer.duration;
      speed = playbackRate;
      startTime = context.currentTime;
      source.start(0, offset);
    },
    stop,
    position: () => source ? (offset + (context.currentTime - startTime) * speed) % buffer.duration : null,
    dispose() { stop(); void context.close(); },
  };
}
