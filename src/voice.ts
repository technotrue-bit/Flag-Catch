/**
 * The announcer: short cheery calls for the big moments, spoken by the
 * phone's own voice a little higher and quicker than usual. Lines are
 * picked from a few of each kind so they don't repeat, and a busy moment
 * keeps only the most important call.
 */
import { settings } from "./settings";

export type Call =
  | "ready"
  | "go"
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

export const LINES: Record<Call, readonly string[]> = {
  ready: ["Ready?", "Get set!"],
  go: ["Go!", "Let's go!"],
  grab: ["Got it! Run home!", "Nice grab!", "Flag snatched!"],
  theyGrab: ["They took a flag!", "Stop that thief!", "Our flag's gone!"],
  score: ["You scored!", "Brilliant!", "What a run!"],
  teamScore: ["Team scores!", "Nice work, team!"],
  theyScore: ["They scored.", "Shake it off!"],
  save: ["Flag saved!", "Good save!"],
  popped: ["Ouch!", "Popped!"],
  knockout: ["Knockout!", "Down they go!"],
  powerUp: ["Power up!", "Ooh, shiny!"],
  thirty: ["Thirty seconds left!"],
  ten: ["Ten seconds!", "Final ten!"],
  almost: ["Almost there!"],
  win: ["You win!", "Victory!"],
  lose: ["So close! Try again!", "Next time!"],
  draw: ["It's a draw!"],
  best: ["New best score!"],
  unlock: ["Something new is open!"],
};

/** How much each call matters; a busy voice only gives way to a bigger one. */
export const PRIORITY: Record<Call, number> = {
  ready: 3,
  go: 4,
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

const last: Partial<Record<Call, number>> = {};

/** The next line for a call, never the same one twice in a row. */
export function lineFor(call: Call, roll = Math.random()): string {
  const lines = LINES[call];
  let i = Math.floor(roll * lines.length) % lines.length;
  if (lines.length > 1 && i === last[call]) i = (i + 1) % lines.length;
  last[call] = i;
  return lines[i];
}

/** The same call waits this long before it can come again, so a crowd doesn't nag. */
const REPEAT_MS = 6000;
const saidAt: Partial<Record<Call, number>> = {};

/** Whether a call may be said now, given what is being said and when it was last heard. */
export function mayAnnounce(call: Call, now: number, busy: { until: number; priority: number }, lastAt?: number): boolean {
  const pr = PRIORITY[call];
  if (now < busy.until && pr <= busy.priority) return false;
  if (pr < 3 && lastAt !== undefined && now - lastAt < REPEAT_MS) return false;
  return true;
}

let busyUntil = 0;
let busyPriority = 0;
let voice: SpeechSynthesisVoice | null | undefined;

function synth(): SpeechSynthesis | null {
  return typeof speechSynthesis === "undefined" ? null : speechSynthesis;
}

/** A bright English voice, chosen once the phone lists its voices. */
function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const all = s.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (!all.length) return null;
  const liked = ["Samantha", "Karen", "Google US English", "Moira", "Tessa", "Microsoft Aria", "Microsoft Jenny"];
  for (const name of liked) {
    const v = all.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return all.find((v) => v.localService) ?? all[0];
}

/** Call from a tap: phones only let a page speak after the player touched it. */
export function primeVoice(): void {
  const s = synth();
  if (!s) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    s.speak(u);
  } catch {
    // No speech here; chatter still plays.
  }
}

/** Say a call, if the announcer is on and nothing more important is talking. */
export function announce(call: Call, now = performance.now()): void {
  const s = synth();
  if (!s || settings.voice !== "announcer" || settings.sound <= 0) return;
  const pr = PRIORITY[call];
  if (!mayAnnounce(call, now, { until: busyUntil, priority: busyPriority }, saidAt[call])) return;
  saidAt[call] = now;
  if (voice === undefined || voice === null) voice = pickVoice();
  const text = lineFor(call);
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-US";
    u.pitch = 1.35;
    u.rate = 1.12;
    u.volume = Math.min(1, settings.sound * 1.1);
    s.speak(u);
    busyUntil = now + 450 + text.length * 55;
    busyPriority = pr;
  } catch {
    // Speech failed; the game carries on.
  }
}

/** Stop talking, for the pause menu and leaving a match. */
export function hush(): void {
  try {
    synth()?.cancel();
  } catch {
    // Nothing to stop.
  }
  busyUntil = 0;
}
