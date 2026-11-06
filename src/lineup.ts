/**
 * Which animals the CPUs ride, chosen for the world being played. Each world favors different ground: swimmers
 * rule Deep Lagoon and Ring Reef, can't cross Lava Loop and have little water on Rust Dunes, land animals spend
 * Deep Lagoon wading, Storm Spire's wind shoves flyers about, and on Frost Floe only the grippy animals hold the
 * road. So a CPU picks an animal that fits the world, and each team gets a fair mix of jobs (raiders, hunters,
 * guardians, a bomber, all rounders) instead of whatever came up. The sim gives both teams the same line up slot by
 * slot, so neither side starts with the better animals.
 */
import { ANIMALS, ANIMAL_IDS, type AnimalDef, type Style } from "./animals";
import type { WorldId } from "./worlds";

/** How well each kind of animal gets about on each world, 1 being Home Isle's land animal. */
const GROUND: Record<WorldId, { land: number; water: number; air: number }> = {
  home: { land: 1, water: 0.85, air: 0.8 },
  reef: { land: 0.75, water: 1.2, air: 0.85 },
  bluffs: { land: 1.1, water: 0.6, air: 0.8 },
  frost: { land: 0.9, water: 0.9, air: 0.8 },
  lagoon: { land: 0.2, water: 1.3, air: 1.1 },
  storm: { land: 1, water: 0.8, air: 0.45 },
  dunes: { land: 1.1, water: 0.25, air: 0.9 },
  lava: { land: 1, water: 0.1, air: 1.1 },
};

/** Fastest land speed among the land animals; a swimmer on land is measured against it. */
const TOP_LAND = 15;

/** Below this an animal is a poor pick for the world, and CPUs leave it alone when anything else will do. */
export const POOR_FIT = 0.35;

/** How well an animal suits a world: about 1 for a good pick, near 0 for one that can barely get about. */
export function worldFit(def: AnimalDef, world: string): number {
  const g = GROUND[world as WorldId] ?? GROUND.home;
  if (def.cls === "air") return g.air;
  // On ice only the grippy ones hold the road; the rest slide wide on every turn.
  const ice = world === "frost" ? (def.iceGrip ? 1.25 : 0.85) : 1;
  const onLand = g.land * ice;
  if (def.cls === "land") return onLand;
  // A swimmer is as good as the water lets it be, or as its legs carry it on land: the bowl and the pogo do well,
  // a slow waddle hardly counts.
  const legs = Math.min(1, def.landSpeed / TOP_LAND);
  return Math.max(g.water, onLand * legs * legs);
}

/** The share of a team each job should take, about. */
const MIX: Record<Style, number> = { raider: 0.32, hunter: 0.24, guardian: 0.2, allrounder: 0.16, bomber: 0.08 };

/**
 * One team's CPU line up for `world`, `count` animals long. `first` is the animal already in slot 0 (yours, and
 * your rival's), counted toward the mix. Same rng, same line up.
 */
export function pickLineup(rng: () => number, world: string, count: number, first?: string): string[] {
  const fits = new Map(ANIMAL_IDS.map((id) => [id, worldFit(ANIMALS[id], world)]));
  const good = ANIMAL_IDS.filter((id) => fits.get(id)! >= POOR_FIT);
  const pool = good.length ? good : ANIMAL_IDS;
  const jobs = new Map<Style, number>();
  const used = new Map<string, number>();
  let placed = 0;
  const place = (id: string) => {
    const s = ANIMALS[id].style;
    jobs.set(s, (jobs.get(s) ?? 0) + 1);
    used.set(id, (used.get(id) ?? 0) + 1);
    placed++;
  };
  if (first && ANIMALS[first]) place(first);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    // A job the team is short of weighs more, an animal it already has plenty of weighs less, and a better fit for
    // the world weighs most of all.
    const weights = pool.map((id) => {
      const def = ANIMALS[id];
      const short = MIX[def.style] * (placed + 1) - (jobs.get(def.style) ?? 0);
      const need = Math.max(0.08, 0.5 + short);
      const fit = fits.get(id)!;
      return fit * fit * need / (1 + 0.6 * (used.get(id) ?? 0));
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    let k = 0;
    while (k < pool.length - 1 && r >= weights[k]) r -= weights[k++];
    out.push(pool[k]);
    place(pool[k]);
  }
  return out;
}
