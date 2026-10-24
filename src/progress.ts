/**
 * Points, unlocks and best scores, kept on the phone. Every match pays your
 * own points plus a bonus for a win; points add up and open new animals,
 * worlds and Playful mode along the way. Pure logic over a tiny store, so
 * the tests can run it without a browser.
 */
import type { Mode } from "./sim";

export interface Progress {
  /** Points earned over every match. */
  points: number;
  /** Your best match points on each world. */
  best: Record<string, number>;
  played: number;
  wins: number;
  /** Things opened outside the points track (the first seven animals for players from before unlocks). */
  extra: string[];
}

export interface Unlock {
  at: number;
  animals?: string[];
  worlds?: string[];
  modes?: Mode[];
}

/** The unlock track. Everything at 0 is open from the start. */
export const UNLOCKS: readonly Unlock[] = [
  { at: 0, animals: ["lion", "wolf"], worlds: ["home"], modes: ["capture", "hoard"] },
  { at: 100, animals: ["penguin"], worlds: ["reef"] },
  { at: 250, animals: ["croc"] },
  { at: 450, animals: ["bird"], worlds: ["bluffs"] },
  { at: 700, animals: ["eagle"] },
  { at: 1000, animals: ["mammoth"], worlds: ["frost"] },
  { at: 1350, animals: ["shark"] },
  { at: 1750, animals: ["goldfish"], worlds: ["lagoon"] },
  { at: 2200, animals: ["panther"], worlds: ["storm"] },
  { at: 2700, animals: ["flyfish"] },
  { at: 3250, animals: ["frog"], worlds: ["dunes"] },
  { at: 3850, animals: ["bat"], worlds: ["lava"], modes: ["playful"] },
];

export const WIN_BONUS = 100;
export const DRAW_BONUS = 40;

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "flagcatch.progress";
/** Keys only a player from before unlocks would have. */
const LEGACY = ["flagcatch.size", "flagcatch.mode", "flagcatch.music"];
const CLASSIC = ["lion", "penguin", "croc", "bird", "eagle", "mammoth", "wolf"];

export function fresh(): Progress {
  return { points: 0, best: {}, played: 0, wins: 0, extra: [] };
}

export function load(store: Store | null): Progress {
  if (!store) return fresh();
  try {
    const raw = store.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return {
        points: Math.max(0, Number(p.points) || 0),
        best: typeof p.best === "object" && p.best ? p.best : {},
        played: Number(p.played) || 0,
        wins: Number(p.wins) || 0,
        extra: Array.isArray(p.extra) ? p.extra.filter((x) => typeof x === "string") : [],
      };
    }
    // Players from before unlocks keep the animals they already had.
    const p = fresh();
    if (LEGACY.some((k) => store.getItem(k) !== null)) p.extra = [...CLASSIC];
    return p;
  } catch {
    return fresh();
  }
}

export function save(store: Store | null, p: Progress): void {
  try {
    store?.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode: progress lasts until the page closes.
  }
}

/** Everything open at this many points, plus any extras. */
export function unlocked(p: Progress, all = false): Set<string> {
  const open = new Set<string>(p.extra);
  for (const u of UNLOCKS) {
    if (!all && u.at > p.points) continue;
    for (const id of [...(u.animals ?? []), ...(u.worlds ?? []), ...(u.modes ?? [])]) open.add(id);
  }
  return open;
}

/** Points needed to open `id`, or 0 if it's open from the start. */
export function costOf(id: string): number {
  return UNLOCKS.find((u) => [...(u.animals ?? []), ...(u.worlds ?? []), ...(u.modes ?? [])].includes(id))?.at ?? 0;
}

/** The next step on the track, if any. */
export function nextUnlock(p: Progress): Unlock | undefined {
  return UNLOCKS.find((u) => u.at > p.points);
}

export interface Award {
  gained: number;
  /** Best score on this world beaten. */
  record: boolean;
  /** Ids opened by this match. */
  opened: string[];
}

/** Pay out a finished match: your points plus a win or draw bonus. */
export function award(p: Progress, world: string, myScore: number, result: "win" | "draw" | "loss"): Award {
  const before = unlocked(p);
  const gained = Math.max(0, Math.round(myScore)) + (result === "win" ? WIN_BONUS : result === "draw" ? DRAW_BONUS : 0);
  p.points += gained;
  p.played++;
  if (result === "win") p.wins++;
  const record = myScore > (p.best[world] ?? 0);
  if (record) p.best[world] = Math.round(myScore);
  const opened = [...unlocked(p)].filter((id) => !before.has(id));
  return { gained, record, opened };
}
