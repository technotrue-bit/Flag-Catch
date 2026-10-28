/**
 * FLAG CATCH: team game plans. Each CPU team picks an overall plan at the
 * start of a match (never the same one as the other team, and never one it
 * just used) and rethinks it every so often, sooner when the score changes.
 * A plan sets how the team splits up (how many raid, guard and hunt), how its
 * raiders come in (straight, wide, all down one side, both sides, in waves,
 * behind a decoy) and how hard it fights in the middle. On top of the plan,
 * each team rolls its own way of moving for the match: patrol direction and
 * pace, how wide its runs swing, when its middle players push. So two matches
 * on the same island play out differently even with the same animals.
 */
import type { RNG } from "./rng";

export type PlanId = "balanced" | "rush" | "turtle" | "flank" | "split" | "decoy" | "swarm" | "waves";

export interface PlanDef {
  id: PlanId;
  /** Share of the team that raids, at most. */
  raid: number;
  /** Share that guards home while there's a flag there. */
  guard: number;
  /** Extra hunters sent after each thief. */
  hunters: number;
  /** Extra bodyguards for each carrier. */
  escorts: number;
  /** How far raiders swing out from the straight line to the flag: 0 straight, 1 usual, 2 very wide. */
  wide: number;
  /** Where raiders come in: spread over all lanes, all down one side, or both sides and not the middle. */
  lanes: "spread" | "one" | "both";
  /** Above 0: raiders gather in the middle until this share of them is there, then go together. */
  wave: number;
  /** Share of the raiders who go in first and loud on the other side, to pull the guards away. */
  decoy: number;
  /** How keenly anyone not raiding or guarding presses forward and picks fights. */
  press: number;
  /** Guards' patrol ring size: under 1 hugs the flag, over 1 screens further out. */
  ring: number;
}

export const PLANS: Record<PlanId, PlanDef> = {
  balanced: { id: "balanced", raid: 0.5, guard: 0.22, hunters: 0, escorts: 0, wide: 1, lanes: "spread", wave: 0, decoy: 0, press: 0.5, ring: 1 },
  rush: { id: "rush", raid: 0.58, guard: 0.2, hunters: 0, escorts: 1, wide: 0.6, lanes: "spread", wave: 0, decoy: 0, press: 0.7, ring: 0.85 },
  turtle: { id: "turtle", raid: 0.42, guard: 0.3, hunters: 1, escorts: 0, wide: 1.1, lanes: "spread", wave: 0, decoy: 0, press: 0.35, ring: 1.25 },
  flank: { id: "flank", raid: 0.5, guard: 0.2, hunters: 0, escorts: 0, wide: 1.5, lanes: "one", wave: 0, decoy: 0, press: 0.5, ring: 1 },
  split: { id: "split", raid: 0.5, guard: 0.2, hunters: 0, escorts: 0, wide: 1.3, lanes: "both", wave: 0, decoy: 0, press: 0.45, ring: 1.1 },
  decoy: { id: "decoy", raid: 0.5, guard: 0.2, hunters: 0, escorts: 0, wide: 1.4, lanes: "one", wave: 0, decoy: 0.3, press: 0.55, ring: 1 },
  swarm: { id: "swarm", raid: 0.46, guard: 0.18, hunters: 1, escorts: 1, wide: 0.9, lanes: "spread", wave: 0, decoy: 0, press: 0.8, ring: 1.15 },
  waves: { id: "waves", raid: 0.5, guard: 0.2, hunters: 0, escorts: 0, wide: 1.1, lanes: "spread", wave: 0.6, decoy: 0, press: 0.5, ring: 1 },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** A team's plan and its own way of moving this match, as plain data so a saved match keeps it. */
export interface TeamBrain {
  plan: PlanId;
  /** Every plan used this match, in order. */
  history: PlanId[];
  /** Match time the plan started, and when the team rethinks it. */
  since: number;
  until: number;
  /** The score when the plan was picked, so a goal for either side brings the rethink forward. */
  seen: [number, number];
  /** One-sided plans: which side (-1 left, 1 right, as seen from home). */
  side: number;
  /** Raids in waves: gathering in the middle or going, since when, and where they meet. */
  wave: "gather" | "go";
  waveT: number;
  stageX: number;
  stageZ: number;
  /** This match's movement: patrol direction and pace, run width, the middle's rhythm and reach. */
  patrolDir: number;
  patrolPace: number;
  wideJitter: number;
  sweepPhase: number;
  sweepRate: number;
  sweepReach: number;
  /** Where the other team's thieves have been coming in from, for guards to lean towards. */
  threatX: number;
}

/** What the team knows when it rethinks: the gap (positive when behind) and how late it is (0 to 1). */
export interface PlanSituation {
  behind: number;
  late: number;
  /** How well the team reads the game (0 to 1). */
  tactics: number;
  /** What the other team is doing, when this team has seen enough to tell. */
  vs?: PlanId;
}

/**
 * What a team that reads the game answers each plan with: hit an emptied
 * base, wall up against one-sided raids, spread out against hunters, catch
 * a wave while it gathers, and overwhelm a wall all at once.
 */
const ANSWERS: Record<PlanId, PlanId[]> = {
  balanced: ["turtle", "flank"],
  rush: ["split", "turtle"],
  turtle: ["waves", "decoy", "split"],
  flank: ["turtle", "swarm"],
  split: ["swarm", "turtle"],
  decoy: ["turtle", "balanced"],
  swarm: ["split", "flank"],
  waves: ["rush", "swarm"],
};

/** How much of a gamble each plan is: it scores more but leaves more open at the back. */
const GAMBLE: Record<PlanId, number> = { balanced: 0, turtle: 0, flank: 0.2, split: 0.3, swarm: 0.3, decoy: 0.7, waves: 0.8, rush: 0.9 };

/** How much each plan suits being behind, ahead or level. */
function suits(id: PlanId, s: PlanSituation): number {
  const t = s.tactics;
  const urgency = s.behind > 0 ? s.late : 0;
  const comfort = s.behind < 0 ? s.late : 0;
  const w: Record<PlanId, number> = {
    balanced: 1,
    rush: 1 + 2.5 * urgency * t,
    turtle: 1 + 3 * comfort * t - 0.8 * urgency * t,
    flank: 1 + 0.6 * urgency * t,
    split: 1 + 0.6 * urgency * t,
    decoy: 1 + 0.8 * urgency * t,
    swarm: 1 + 1.2 * comfort * t + 0.8 * urgency * t,
    waves: 1 + 1.5 * urgency * t,
  };
  // Teams that read the game lean on the steadier plans and save the gambles for when they need them.
  w[id] *= 1 - 0.4 * t * GAMBLE[id] * (1 - urgency);
  if (s.vs && ANSWERS[s.vs].includes(id)) w[id] *= 1 + 3 * t;
  return Math.max(0.05, w[id]);
}

/** Picks a plan, never one of `avoid` while any other is left, weighted by how well it suits the moment. */
export function pickPlan(rng: RNG, s: PlanSituation, avoid: readonly string[]): PlanId {
  let pool = PLAN_IDS.filter((id) => !avoid.includes(id));
  if (!pool.length) pool = PLAN_IDS.slice();
  const weights = pool.map((id) => suits(id, s));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) <= 0) return pool[i];
  return pool[pool.length - 1];
}

/** How long a plan runs before the team rethinks it, in seconds. */
export function planSpan(rng: RNG): number {
  return 30 + rng() * 30;
}

export function newBrain(rng: RNG, plan: PlanId, time: number): TeamBrain {
  return {
    plan,
    history: [plan],
    since: time,
    until: time + planSpan(rng),
    seen: [0, 0],
    side: rng() < 0.5 ? -1 : 1,
    wave: "gather",
    waveT: time,
    stageX: 0,
    stageZ: 0,
    patrolDir: rng() < 0.5 ? -1 : 1,
    patrolPace: 0.25 + rng() * 0.25,
    wideJitter: 0.75 + rng() * 0.5,
    sweepPhase: rng() * Math.PI * 2,
    sweepRate: 0.14 + rng() * 0.16,
    sweepReach: 0.4 + rng() * 0.3,
    threatX: 0,
  };
}

/** Switches a brain to a new plan; one-sided plans pick their side afresh. */
export function switchPlan(b: TeamBrain, rng: RNG, plan: PlanId, time: number, score: [number, number]): void {
  b.plan = plan;
  b.history.push(plan);
  b.since = time;
  b.until = time + planSpan(rng);
  b.seen = [score[0], score[1]];
  // Lean away from the side the last one-sided plan used, but not always.
  b.side = rng() < 0.7 ? -b.side : b.side;
  b.wave = "gather";
  b.waveT = time;
  b.wideJitter = 0.75 + rng() * 0.5;
}
