/**
 * Tiny synth for prototype sounds. Every effect is a few oscillators and a
 * noise burst, panned by where it happens relative to the camera.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

function out(pan: number, gain: number): AudioNode | null {
  if (!ctx || !master) return null;
  const g = ctx.createGain();
  g.gain.value = gain;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(master);
  return g;
}

function tone(type: OscillatorType, from: number, to: number, dur: number, pan: number, gain: number, delay = 0): void {
  const dest = out(pan, gain);
  if (!ctx || !dest) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const env = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(1, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(env).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hiss(dur: number, freq: number, pan: number, gain: number): void {
  const dest = out(pan, gain);
  if (!ctx || !dest || !noise) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = 0.8;
  const env = ctx.createGain();
  env.gain.setValueAtTime(1, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(env).connect(dest);
  s.start(t);
  s.stop(t + dur);
}

export const sfx = {
  throw(pan: number, near: number) {
    hiss(0.18, 2400, pan, 0.25 * near);
    tone("triangle", 700, 1400, 0.12, pan, 0.12 * near);
  },
  pop(pan: number, near: number) {
    hiss(0.35, 900, pan, 0.6 * near);
    tone("square", 320, 60, 0.25, pan, 0.18 * near);
    tone("sine", 1200, 2400, 0.08, pan, 0.12 * near, 0.03);
  },
  fizzle(pan: number, near: number) {
    hiss(0.2, 3200, pan, 0.08 * near);
  },
  grab(pan: number, near: number) {
    tone("triangle", 520, 1040, 0.12, pan, 0.25 * near);
    tone("triangle", 780, 1560, 0.12, pan, 0.2 * near, 0.07);
  },
  drop(pan: number, near: number) {
    tone("triangle", 600, 200, 0.25, pan, 0.2 * near);
  },
  bank(pan: number, near: number) {
    [523, 659, 784, 1046].forEach((f, i) => tone("square", f, f, 0.16, pan, 0.12 * near, i * 0.08));
    hiss(0.5, 5000, pan, 0.12 * near);
  },
  jump(pan: number, near: number) {
    tone("sine", 260, 620, 0.18, pan, 0.22 * near);
  },
  splash(pan: number, near: number) {
    hiss(0.4, 700, pan, 0.3 * near);
  },
  count() {
    tone("square", 660, 660, 0.14, 0, 0.12);
  },
  go() {
    tone("square", 990, 990, 0.12, 0, 0.12);
    tone("square", 1320, 1320, 0.3, 0, 0.12, 0.1);
  },
  pick() {
    tone("triangle", 880, 1320, 0.08, 0, 0.15);
  },
  whistle() {
    tone("sine", 1800, 1800, 0.12, 0, 0.18);
    tone("sine", 1800, 2200, 0.3, 0, 0.18, 0.16);
  },
  end() {
    [784, 659, 523, 784, 1046].forEach((f, i) => tone("triangle", f, f, 0.22, 0, 0.2, i * 0.12));
  },
};
