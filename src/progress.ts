/**
 * Points, unlocks and best scores, kept on the phone. Every match pays your
 * own points plus a bonus for a win; points add up and open new animals,
 * worlds and Playful mode along the way. Pure logic over a tiny store, so
 * the tests can run it without a browser.
 */
import { DAILY_BONUS, dayBefore } from "./daily";
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
  /**
   * What each device earned, by a random device id. points, played and wins are their sums, so two phones that
   * both played since the last sync add up instead of one overwriting the other.
   */
  dev: Record<string, Tally>;
  /** Daily Flag: the last day cleared, the run of days in a row up to it, and the longest run. */
  daily: DailyRun;
}

export interface DailyRun {
  /** YYYY-MM-DD of the last day cleared, or "" before the first. */
  last: string;
  streak: number;
  best: number;
}

/** One device's running totals. Each only ever goes up. */
export interface Tally {
  points: number;
  played: number;
  wins: number;
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

export const PROGRESS_KEY = "flagcatch.progress";
const DEVICE_KEY = "flagcatch.device";
/** Keys only a player from before unlocks would have. */
const LEGACY = ["flagcatch.size", "flagcatch.mode", "flagcatch.music"];
const CLASSIC = ["lion", "penguin", "croc", "bird", "eagle", "mammoth", "wolf"];
/** Enough phones, tablets and browsers for anyone; a save never grows past it. */
const MAX_DEVICES = 64;
const ID = /^[a-z0-9]{1,24}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function fresh(): Progress {
  return { points: 0, best: {}, played: 0, wins: 0, extra: [], dev: {}, daily: { last: "", streak: 0, best: 0 } };
}

const count = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * This device's id, made once and kept with the save. It only tells this device's points apart from another's
 * inside the save; it is never sent anywhere else.
 */
export function deviceId(store: Store | null): string {
  try {
    const have = store?.getItem(DEVICE_KEY);
    if (have && ID.test(have)) return have;
  } catch {
    // Unreadable: make a new one.
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => (b % 36).toString(36)).join("");
  try {
    store?.setItem(DEVICE_KEY, id);
  } catch {
    // Private mode: the id lasts until the page closes.
  }
  return id;
}

/** Sets points, played and wins to the sums of the device tallies. */
function total(p: Progress): Progress {
  const t = Object.values(p.dev);
  p.points = t.reduce((n, d) => n + d.points, 0);
  p.played = t.reduce((n, d) => n + d.played, 0);
  p.wins = t.reduce((n, d) => n + d.wins, 0);
  return p;
}

/**
 * Reads a save from anywhere (this phone or an account), keeping only well formed values. A save from before device
 * tallies puts its totals under `device`.
 */
export function parse(raw: unknown, device: string): Progress {
  const p = fresh();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return p;
  const r = raw as Record<string, unknown>;
  if (typeof r.best === "object" && r.best !== null && !Array.isArray(r.best)) {
    for (const [world, score] of Object.entries(r.best)) if (ID.test(world) && count(score) > 0) p.best[world] = count(score);
  }
  if (typeof r.daily === "object" && r.daily !== null && !Array.isArray(r.daily)) {
    const d = r.daily as Record<string, unknown>;
    if (typeof d.last === "string" && DAY.test(d.last) && count(d.streak) > 0) p.daily = { last: d.last, streak: count(d.streak), best: Math.max(count(d.best), count(d.streak)) };
  }
  if (Array.isArray(r.extra)) p.extra = [...new Set(r.extra.filter((x): x is string => typeof x === "string" && ID.test(x)))];
  const dev = typeof r.dev === "object" && r.dev !== null && !Array.isArray(r.dev) ? (r.dev as Record<string, unknown>) : null;
  if (dev && Object.keys(dev).length) {
    for (const [id, d] of Object.entries(dev)) {
      if (!ID.test(id) || typeof d !== "object" || d === null || Object.keys(p.dev).length >= MAX_DEVICES) continue;
      const t = d as Record<string, unknown>;
      p.dev[id] = { points: count(t.points), played: count(t.played), wins: count(t.wins) };
    }
  } else {
    const legacy = { points: count(r.points), played: count(r.played), wins: count(r.wins) };
    if (legacy.points || legacy.played) p.dev[device] = legacy;
  }
  return total(p);
}

export function load(store: Store | null, device = "local"): Progress {
  if (!store) return fresh();
  try {
    const raw = store.getItem(PROGRESS_KEY);
    if (raw) return parse(JSON.parse(raw), device);
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
    store?.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Private mode: progress lasts until the page closes.
  }
}

/**
 * Folds `other` into `into`: each device keeps its highest tally, best scores keep the higher one, extras add up.
 * Merging the same save twice, or in either order, gives the same result. Returns true when `into` changed.
 */
export function merge(into: Progress, other: Progress): boolean {
  const before = JSON.stringify(into);
  for (const [id, d] of Object.entries(other.dev)) {
    const mine = into.dev[id];
    if (!mine) {
      if (Object.keys(into.dev).length < MAX_DEVICES) into.dev[id] = { ...d };
      continue;
    }
    mine.points = Math.max(mine.points, d.points);
    mine.played = Math.max(mine.played, d.played);
    mine.wins = Math.max(mine.wins, d.wins);
  }
  for (const [world, score] of Object.entries(other.best)) into.best[world] = Math.max(into.best[world] ?? 0, score);
  for (const id of other.extra) if (!into.extra.includes(id)) into.extra.push(id);
  // The run that reached the later day wins; on the same day, the longer one.
  const a = into.daily;
  const b = other.daily;
  const best = Math.max(a.best, b.best);
  if (b.last > a.last || (b.last === a.last && b.streak > a.streak)) into.daily = { last: b.last, streak: b.streak, best };
  else into.daily.best = best;
  total(into);
  return JSON.stringify(into) !== before;
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
export function award(p: Progress, world: string, myScore: number, result: "win" | "draw" | "loss", device = "local"): Award {
  const before = unlocked(p);
  const gained = Math.max(0, Math.round(myScore)) + (result === "win" ? WIN_BONUS : result === "draw" ? DRAW_BONUS : 0);
  const mine = (p.dev[device] ??= { points: 0, played: 0, wins: 0 });
  mine.points += gained;
  mine.played++;
  if (result === "win") mine.wins++;
  total(p);
  const record = myScore > (p.best[world] ?? 0);
  if (record) p.best[world] = Math.round(myScore);
  const opened = [...unlocked(p)].filter((id) => !before.has(id));
  return { gained, record, opened };
}

export interface DailyAward {
  /** Bonus points paid now (0 if today was already cleared). */
  bonus: number;
  /** Days in a row, today included. */
  streak: number;
  /** True the first time today is cleared. */
  first: boolean;
  /** Ids the bonus opened. */
  opened: string[];
}

/**
 * Today's goal cleared: the first clear of the day pays the bonus to this device and adds today to the streak
 * (a missed day starts it again at 1). Clearing it again the same day, or an earlier day's match finishing after a
 * later day was cleared, changes nothing.
 */
export function clearDaily(p: Progress, key: string, device = "local"): DailyAward {
  // Already cleared, or a match from an earlier day finished after a later one was cleared.
  if (p.daily.last >= key) return { bonus: 0, streak: p.daily.streak, first: false, opened: [] };
  const before = unlocked(p);
  const streak = p.daily.last === dayBefore(key) ? p.daily.streak + 1 : 1;
  p.daily = { last: key, streak, best: Math.max(p.daily.best, streak) };
  const mine = (p.dev[device] ??= { points: 0, played: 0, wins: 0 });
  mine.points += DAILY_BONUS;
  total(p);
  const opened = [...unlocked(p)].filter((id) => !before.has(id));
  return { bonus: DAILY_BONUS, streak, first: true, opened };
}

/** The streak as it stands on `key`: alive if the last clear was today or yesterday, else 0. */
export function streakOn(p: Progress, key: string): number {
  return p.daily.last === key || p.daily.last === dayBefore(key) ? p.daily.streak : 0;
}
