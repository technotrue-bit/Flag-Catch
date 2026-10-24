/**
 * Cue chimes: short bell tunes for the big moments, played where an
 * announcer would have spoken. Every note sits in F major, the key of the
 * music, and stays above the low notes a phone speaker swallows. A busy
 * moment keeps only the most important chime.
 */
import { chime, type ChimeNote } from "./audio";
import { settings } from "./settings";

export type Cue =
  | "grab"
  | "theyGrab"
  | "score"
  | "teamScore"
  | "theyScore"
  | "save"
  | "popped"
  | "knockout"
  | "powerUp"
  | "thirty"
  | "ten"
  | "almost"
  | "win"
  | "lose"
  | "draw"
  | "best"
  | "unlock";

/** A note: MIDI pitch, start in seconds, length in seconds, and how it rings. */
const n = (m: number, at: number, dur = 0.35, kind: ChimeNote["kind"] = "bell"): ChimeNote => ({ m, at, dur, kind });

// F5 77, G5 79, A5 81, C6 84, D6 86, E6 88, F6 89, G6 91, A6 93, C7 96.
export const TUNES: Record<Cue, readonly ChimeNote[]> = {
  // Your grab: a quick bright pluck up.
  grab: [n(81, 0, 0.12, "pluck"), n(84, 0.06, 0.12, "pluck"), n(89, 0.12, 0.3)],
  // They took one: a soft two note "uh oh".
  theyGrab: [n(76, 0, 0.22), n(72, 0.14, 0.4)],
  // You scored: a rising arpeggio that rings out, with a sparkle on top.
  score: [n(77, 0, 0.2), n(81, 0.08, 0.2), n(84, 0.16, 0.2), n(89, 0.24, 0.7), n(96, 0.3, 0.5, "pluck")],
  teamScore: [n(81, 0, 0.18), n(84, 0.08, 0.18), n(89, 0.16, 0.5)],
  theyScore: [n(79, 0, 0.25), n(74, 0.16, 0.5)],
  save: [n(84, 0, 0.18), n(89, 0.1, 0.45)],
  // You got popped: a quick tumble down, light not gloomy.
  popped: [n(84, 0, 0.12, "pluck"), n(79, 0.07, 0.12, "pluck"), n(76, 0.14, 0.3)],
  // You popped someone: a punchy pair up.
  knockout: [n(84, 0, 0.12, "pluck"), n(91, 0.07, 0.3, "pluck")],
  powerUp: [n(91, 0, 0.2), n(96, 0.07, 0.45)],
  // Thirty seconds: a ding dong.
  thirty: [n(84, 0, 0.5), n(77, 0.28, 0.7)],
  // Ten seconds: three quick rising pings.
  ten: [n(84, 0, 0.16), n(88, 0.12, 0.16), n(91, 0.24, 0.4)],
  // Hoard, nearly at the target: a climbing run.
  almost: [n(77, 0, 0.2), n(81, 0.12, 0.2), n(84, 0.24, 0.2), n(89, 0.36, 0.5)],
  win: [n(77, 0, 0.22), n(81, 0.12, 0.22), n(84, 0.24, 0.22), n(89, 0.38, 0.9), n(93, 0.5, 0.8), n(96, 0.62, 0.6, "pluck")],
  // A loss still ends on a warm note.
  lose: [n(84, 0, 0.3), n(81, 0.2, 0.3), n(77, 0.4, 0.8)],
  draw: [n(81, 0, 0.25), n(84, 0.16, 0.25), n(81, 0.32, 0.6)],
  best: [n(89, 0, 0.2, "pluck"), n(93, 0.07, 0.2, "pluck"), n(96, 0.14, 0.2, "pluck"), n(101, 0.21, 0.6)],
  unlock: [n(84, 0, 0.18), n(88, 0.06, 0.18), n(91, 0.12, 0.18), n(96, 0.18, 0.5), n(100, 0.3, 0.6, "pluck")],
};

/** How much each cue matters; a ringing chime only gives way to a bigger one. */
export const PRIORITY: Record<Cue, number> = {
  grab: 3,
  theyGrab: 2,
  score: 4,
  teamScore: 2,
  theyScore: 2,
  save: 2,
  popped: 2,
  knockout: 1,
  powerUp: 1,
  thirty: 3,
  ten: 3,
  almost: 3,
  win: 5,
  lose: 5,
  draw: 5,
  best: 4,
  unlock: 4,
};

/** How long a tune rings, in seconds. */
export function tuneLength(cue: Cue): number {
  return Math.max(...TUNES[cue].map((x) => x.at + x.dur));
}

/** The same small cue waits this long before it can come again, so a crowd doesn't nag. */
const REPEAT_MS = 4000;

/** Whether a cue may play now, given what is ringing and when it was last heard. */
export function mayCue(cue: Cue, now: number, busy: { until: number; priority: number }, lastAt?: number): boolean {
  const pr = PRIORITY[cue];
  if (now < busy.until && pr <= busy.priority) return false;
  if (pr < 3 && lastAt !== undefined && now - lastAt < REPEAT_MS) return false;
  return true;
}

let busyUntil = 0;
let busyPriority = 0;
const playedAt: Partial<Record<Cue, number>> = {};

/** Play a cue's chime, if chimes are on and nothing more important is ringing. */
export function cue(name: Cue, now = performance.now()): void {
  if (!settings.chimes || settings.sound <= 0) return;
  if (!mayCue(name, now, { until: busyUntil, priority: busyPriority }, playedAt[name])) return;
  playedAt[name] = now;
  // Bigger cues get a little more room; small ones sit under the action.
  chime(TUNES[name], PRIORITY[name] >= 3 ? 0.2 : 0.14);
  busyUntil = now + tuneLength(name) * 600;
  busyPriority = PRIORITY[name];
}
