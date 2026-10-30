/**
 * Daily Flag: one match a day, the same for every player. The day's date picks the world, animal, mode, island
 * size, rival skill and a goal, so a phone needs nothing from a server to know today's challenge. The world or
 * animal may be one you haven't opened yet: the daily lets you try it for that match. Clearing the goal pays a
 * bonus once a day and adds a day to your streak (the streak itself lives in the save, see progress.ts).
 *
 * trueaigaming.com shows the same challenge on its home page from a copy of dailyFor (src/shared/daily.mjs there);
 * the test below pins sample days so the two copies can be checked against each other.
 */
import { ANIMALS, type AnimalClass } from "./animals";
import { mulberry32 } from "./rng";
import type { Difficulty, Mode } from "./sim";
import type { MatchStats } from "./hud";

export type GoalKind = "win" | "banks" | "steals" | "knockouts";

export interface DailyGoal {
  kind: GoalKind;
  /** How many (1 for a win). */
  n: number;
}

export interface Daily {
  /** The local date it's for, YYYY-MM-DD. */
  key: string;
  seed: number;
  world: string;
  animal: string;
  mode: Mode;
  /** Animals a side. */
  per: number;
  difficulty: Difficulty;
  goal: DailyGoal;
}

/** Points for clearing the day's goal, paid once a day on top of the match's own points. */
export const DAILY_BONUS = 150;

/** Worlds in a fixed order, so a day's pick never moves when the world list is reordered elsewhere. */
const WORLD_ORDER = ["home", "reef", "bluffs", "frost", "lagoon", "storm", "dunes", "lava"] as const;
const ANIMAL_ORDER = ["lion", "penguin", "croc", "bird", "eagle", "mammoth", "wolf", "shark", "goldfish", "panther", "flyfish", "bat", "frog"] as const;

/** Swimmers can't cross lava and have little water on the dunes; land animals spend Deep Lagoon wading. */
const AVOID: Record<string, readonly AnimalClass[]> = { lava: ["water"], dunes: ["water"], lagoon: ["land"] };

/** Goals a typical player clears in one or two tries. */
const GOALS: Record<"capture" | "playful", readonly DailyGoal[]> = {
  capture: [
    { kind: "win", n: 1 },
    { kind: "banks", n: 1 },
    { kind: "steals", n: 2 },
    { kind: "knockouts", n: 4 },
  ],
  playful: [
    { kind: "win", n: 1 },
    { kind: "banks", n: 2 },
    { kind: "steals", n: 3 },
    { kind: "knockouts", n: 4 },
  ],
};

/** The local date as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The key of the day before `key`. */
export function dayBefore(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12));
}

/** FNV-1a over the date, so neighbouring days get unrelated seeds. */
function seedOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0 || 1;
}

/** Today's challenge (or any day's). Same date in, same challenge out, on every phone. */
export function dailyFor(date: Date | string): Daily {
  const key = typeof date === "string" ? date : dayKey(date);
  const seed = seedOf(key);
  const rng = mulberry32(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  const world = pick(WORLD_ORDER);
  const animals = ANIMAL_ORDER.filter((id) => !(AVOID[world] ?? []).includes(ANIMALS[id].cls));
  const animal = pick(animals);
  // Three days in four are Capture, the rest Playful (a free try for most players). Never Hoard, which can run to
  // 15 minutes; small islands, so a daily takes a few minutes.
  const mode: "capture" | "playful" = rng() < 3 / 4 ? "capture" : "playful";
  const per = rng() < 0.75 ? 8 : 16;
  const difficulty: Difficulty = rng() < 0.6 ? "easy" : "medium";
  const goal = { ...pick(GOALS[mode]) };
  return { key, seed, world, animal, mode, per, difficulty, goal };
}

/** The goal in words, for the title screen, the countdown and the results card. */
export function goalText(d: Pick<Daily, "goal" | "mode">): string {
  const { kind, n } = d.goal;
  if (kind === "win") return "WIN THE MATCH";
  if (kind === "banks") {
    return n === 1 ? "SCORE A FLAG YOURSELF" : `SCORE ${n} FLAGS YOURSELF`;
  }
  if (kind === "steals") return n === 1 ? "GRAB A FLAG" : `GRAB ${n} FLAGS`;
  return n === 1 ? "POP A RIVAL" : `POP ${n} RIVALS`;
}

/** How far along the goal a match got, and whether it's cleared. */
export function goalProgress(goal: DailyGoal, stats: MatchStats, won: boolean): { have: number; done: boolean } {
  const have = goal.kind === "win" ? (won ? 1 : 0) : goal.kind === "banks" ? stats.banks : goal.kind === "steals" ? stats.steals : stats.knockouts;
  return { have: Math.min(have, goal.n), done: have >= goal.n };
}
