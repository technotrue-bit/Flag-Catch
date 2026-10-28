/**
 * Tiny synth for every sound. Each effect is a few oscillators and a noise
 * burst, panned by where it happens relative to the camera. Music and
 * effects (cue chimes included) run on their own buses so Settings can set
 * each level.
 */
import { onSettings, settings } from "./settings";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let ducked = false;

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
    musicBus = ctx.createGain();
    musicBus.gain.value = musicLevel();
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = settings.sound;
    sfxBus.connect(master);
    if (wantLevel >= 0) startClock();
  } catch {
    ctx = null;
  }
}

/*
 * Music: a sunny island loop in F major, written for this game. Bass,
 * a marimba style arpeggio and a little whistled tune over I V vi IV.
 * Level 0 is the calm menu loop, 1 adds drums and the tune, 2 is the
 * frantic finish: faster, busier hats, the tune an octave up.
 */
const MUSIC_VOLUME = 0.34;
let musicBus: GainNode | null = null;
let wantLevel = -1;
let level: 0 | 1 | 2 = 0;
let clock: number | undefined;
let nextTime = 0;
let stepIndex = 0;

// Chord roots as MIDI notes, one bar each: F, C, Dm, Bb.
const ROOTS = [53, 48, 50, 46];
const CHORDS = [
  [0, 4, 7],
  [0, 4, 7],
  [0, 3, 7],
  [0, 4, 7],
];
// Two bars of tune per pair of chords, 16 steps a bar, as MIDI notes (0 = rest).
const TUNE = [
  [77, 0, 0, 79, 81, 0, 79, 0, 77, 0, 74, 0, 72, 0, 0, 0, 72, 0, 74, 0, 76, 0, 79, 0, 79, 0, 0, 0, 76, 0, 74, 0],
  [74, 0, 0, 72, 74, 0, 77, 0, 81, 0, 79, 0, 77, 0, 0, 0, 74, 0, 72, 0, 70, 0, 72, 0, 74, 0, 0, 0, 77, 0, 0, 0],
];

function musicLevel(): number {
  return settings.music * MUSIC_VOLUME * (ducked ? 0.35 : 1);
}

onSettings(() => {
  if (!ctx) return;
  musicBus?.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.08);
  sfxBus?.gain.setTargetAtTime(settings.sound, ctx.currentTime, 0.05);
});

function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function note(type: OscillatorType, midi: number, when: number, dur: number, gain: number): void {
  if (!ctx || !musicBus) return;
  const o = ctx.createOscillator();
  const env = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(hz(midi), when);
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(gain, when + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(env).connect(musicBus);
  o.start(when);
  o.stop(when + dur + 0.02);
}

function drum(kind: "kick" | "snare" | "hat", when: number): void {
  if (!ctx || !musicBus || !noise) return;
  if (kind === "kick") {
    const o = ctx.createOscillator();
    const env = ctx.createGain();
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    env.gain.setValueAtTime(0.5, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    o.connect(env).connect(musicBus);
    o.start(when);
    o.stop(when + 0.2);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = kind === "hat" ? "highpass" : "bandpass";
  f.frequency.value = kind === "hat" ? 7000 : 1800;
  const env = ctx.createGain();
  const dur = kind === "hat" ? 0.04 : 0.14;
  env.gain.setValueAtTime(kind === "hat" ? 0.08 : 0.22, when);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f).connect(env).connect(musicBus);
  src.start(when);
  src.stop(when + dur + 0.01);
}

function scheduleStep(i: number, when: number): void {
  const bar = Math.floor(i / 16) % 4;
  const s = i % 16;
  const root = ROOTS[bar];
  const chord = CHORDS[bar];
  const sixteenth = 60 / [104, 124, 134][level] / 4;
  // Bass: root and fifth on a skipping beat.
  if (s === 0 || s === 6 || s === 8 || s === 14) note("triangle", root - 12 + (s === 6 || s === 14 ? 7 : 0), when, sixteenth * 2.2, 0.32);
  // Marimba arpeggio on the eighths.
  if (s % 2 === 0) {
    const tone = chord[(s / 2) % 3] + 12 * (1 + Math.floor(s / 6) % 2);
    note("triangle", root + tone, when, 0.22, level === 0 ? 0.1 : 0.13);
    note("sine", root + tone + 12, when, 0.12, 0.04);
  }
  if (level >= 1) {
    if (s === 0 || s === 8 || (level === 2 && (s === 4 || s === 12)) || (level === 1 && s === 10)) drum("kick", when);
    if (s === 4 || s === 12) drum("snare", when);
    if (level === 2 || s % 2 === 0) drum("hat", when);
    const phrase = TUNE[Math.floor(i / 32) % 2];
    const m = phrase[i % 32];
    if (m) note("square", m + (level === 2 ? 12 : 0) - 12, when, sixteenth * 2.6, 0.055);
  }
}

function startClock(): void {
  if (!ctx || clock !== undefined) return;
  nextTime = ctx.currentTime + 0.08;
  stepIndex = 0;
  clock = window.setInterval(() => {
    if (!ctx) return;
    // After the tab sleeps, pick up from now instead of rushing to catch up.
    if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.2) {
      if (stepIndex % 16 === 0 && wantLevel >= 0) level = wantLevel as 0 | 1 | 2;
      scheduleStep(stepIndex, nextTime);
      nextTime += 60 / [104, 124, 134][level] / 4;
      stepIndex++;
    }
  }, 50);
}

export const music = {
  /** Start or change the loop: 0 menu, 1 match, 2 the frantic finish. */
  play(l: 0 | 1 | 2) {
    // A change of level waits for the next bar so the groove holds.
    if (clock === undefined) level = l;
    wantLevel = l;
    startClock();
  },
  stop() {
    wantLevel = -1;
    if (clock !== undefined) window.clearInterval(clock);
    clock = undefined;
  },
  get level(): number {
    return wantLevel;
  },
  /** Quieter under the pause menu. */
  duck(on: boolean) {
    ducked = on;
    if (ctx && musicBus) musicBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.1);
  },
};

function out(pan: number, gain: number): AudioNode | null {
  if (!ctx || !sfxBus) return null;
  const g = ctx.createGain();
  g.gain.value = gain;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(sfxBus);
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
  /** One puff of the confetti gun: short and soft, as it fires seven a second. */
  spray(pan: number, near: number) {
    hiss(0.05, 4200, pan, 0.07 * near);
    tone("triangle", 1500, 1900, 0.04, pan, 0.03 * near);
  },
  /** A confetti shot landing on someone: a short bright tick. */
  sting(pan: number, near: number) {
    tone("square", 1900, 2400, 0.03, pan, 0.06 * near);
  },
  /** A flyer's big bomb: a deeper thump than a pop. */
  boom(pan: number, near: number) {
    hiss(0.55, 600, pan, 0.75 * near);
    tone("square", 220, 40, 0.4, pan, 0.22 * near);
    tone("sine", 900, 1800, 0.1, pan, 0.1 * near, 0.04);
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
  /** The last seconds of the clock; the final three ring higher. */
  tick(urgent: boolean) {
    tone("square", urgent ? 1175 : 880, urgent ? 1175 : 880, 0.07, 0, 0.09);
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
  /** Picked up a power up: a quick rising sparkle. */
  item(pan: number, near: number) {
    [880, 1175, 1568].forEach((f, i) => tone("triangle", f, f * 1.02, 0.1, pan, 0.18 * near, i * 0.05));
  },
  use(pan: number, near: number) {
    tone("sawtooth", 300, 900, 0.22, pan, 0.12 * near);
    hiss(0.25, 3000, pan, 0.12 * near);
  },
  block(pan: number, near: number) {
    tone("sine", 1600, 1400, 0.15, pan, 0.2 * near);
    tone("sine", 2400, 2200, 0.12, pan, 0.1 * near, 0.03);
  },
  zap(pan: number, near: number) {
    hiss(0.5, 4500, pan, 0.5 * near);
    tone("square", 90, 40, 0.4, pan, 0.2 * near);
  },
  end() {
    [784, 659, 523, 784, 1046].forEach((f, i) => tone("triangle", f, f, 0.22, 0, 0.2, i * 0.12));
  },
};

export interface ChimeNote {
  /** MIDI pitch. */
  m: number;
  /** Start, in seconds from now. */
  at: number;
  /** How long it rings, in seconds. */
  dur: number;
  /** A bell rings out with a soft overtone; a pluck is short and bright. */
  kind: "bell" | "pluck";
}

/** Play a little tune of bell and pluck notes on the sounds bus. */
export function chime(notes: readonly ChimeNote[], gain: number, pan = 0): void {
  const dest = out(pan, gain);
  if (!ctx || !dest) return;
  const t0 = ctx.currentTime + 0.02;
  for (const x of notes) {
    const t = t0 + x.at;
    const f = hz(x.m);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + (x.kind === "pluck" ? 0.004 : 0.008));
    env.gain.exponentialRampToValueAtTime(0.0001, t + x.dur);
    env.connect(dest);
    const body = ctx.createOscillator();
    body.type = x.kind === "pluck" ? "triangle" : "sine";
    body.frequency.setValueAtTime(f, t);
    body.connect(env);
    body.start(t);
    body.stop(t + x.dur + 0.02);
    // The bell's shimmer: a quiet overtone that fades faster than the note.
    const over = ctx.createOscillator();
    const og = ctx.createGain();
    over.type = "sine";
    over.frequency.setValueAtTime(f * (x.kind === "pluck" ? 2 : 3), t);
    og.gain.setValueAtTime(x.kind === "pluck" ? 0.25 : 0.18, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + x.dur * 0.5);
    over.connect(og).connect(env);
    over.start(t);
    over.stop(t + x.dur + 0.02);
  }
}

/*
 * Animal moods: where the animals used to chatter, a soft tone on each
 * animal's own note says how it feels. Happy steps up, cheer runs up
 * three notes, sad steps down, ouch is one quick drop. Notes snap to the
 * F major pentatonic so they never clash with the music.
 */
export type Mood = "happy" | "cheer" | "sad" | "ouch";
// Each animal's note: small and quick animals high, big ones lower.
const ANIMAL_NOTE: Record<string, number> = {
  lion: 77,
  wolf: 74,
  penguin: 84,
  croc: 69,
  bird: 89,
  eagle: 81,
  mammoth: 65,
  shark: 72,
  goldfish: 91,
  panther: 79,
  flyfish: 86,
  bat: 93,
  frog: 81,
};
// F major pentatonic steps above F: F G A C D.
const PENTA = [0, 2, 4, 7, 9];

/** The pentatonic note `steps` away from `midi` (which should already be on the scale). */
export function scaleStep(midi: number, steps: number): number {
  const rel = midi - 53;
  const oct = Math.floor(rel / 12);
  let idx = PENTA.indexOf(rel - oct * 12);
  if (idx < 0) idx = 0;
  const k = oct * 5 + idx + steps;
  return 53 + Math.floor(k / 5) * 12 + PENTA[((k % 5) + 5) % 5];
}

/** The notes an animal plays for a mood. */
export function moodNotes(animal: string, mood: Mood): ChimeNote[] {
  const base = ANIMAL_NOTE[animal] ?? 77;
  const p = (steps: number, at: number, dur: number): ChimeNote => ({ m: scaleStep(base, steps), at, dur, kind: "pluck" });
  if (mood === "happy") return [p(0, 0, 0.12), p(2, 0.08, 0.2)];
  if (mood === "cheer") return [p(0, 0, 0.12), p(2, 0.07, 0.12), p(5, 0.14, 0.3)];
  if (mood === "sad") return [p(1, 0, 0.16), p(-1, 0.12, 0.3)];
  return [p(1, 0, 0.08), p(-1, 0.05, 0.16)];
}

let moodAt = 0;

/** An animal nearby reacts to what just happened to it. */
export function moodTone(animal: string, mood: Mood, pan = 0, near = 1): void {
  if (!ctx || !settings.chimes || near < 0.15) return;
  // A crowd of reactions at once would turn to mush; let one through at a time.
  if (ctx.currentTime - moodAt < 0.18) return;
  moodAt = ctx.currentTime;
  chime(moodNotes(animal, mood), 0.1 * near, pan);
}

/** A short buzz on phones that allow it (not iPhone Safari). */
export function buzz(ms: number | number[]): void {
  if (!settings.vibrate) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // No vibration here.
  }
}
