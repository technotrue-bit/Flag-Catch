/**
 * Which animals may play each world, and which ones the CPUs ride there. The worlds run from all land to all sea:
 * Rust Dunes has no water at all, so slow swimmers sit it out; Deep Lagoon is open sea, so land animals do; swimmers
 * can't cross Lava Loop; Storm Spire's wind shoves flyers about; on Frost Floe only the grippy animals hold the road.
 * An animal that can barely get about on a world isn't allowed there, for you or the CPUs (your rival rides your
 * animal, so yours has to be allowed too). Among the rest a CPU picks one that fits the world, and each team gets a
 * fair mix of jobs (raiders, hunters, guardians, a bomber, all rounders). The sim gives both teams the same line up
 * slot by slot, so neither side starts with the better animals.
 */
import { ANIMALS, ANIMAL_IDS, type AnimalDef, type Style } from "./animals";
import type { WorldId } from "./worlds";

/** How well each kind of animal gets about on each world, 1 being Home Isle's land animal. */
const GROUND: Record<WorldId, { land: number; water: number; air: number }> = {
  // All land: no water anywhere.
  dunes: { land: 1.1, water: 0, air: 0.9 },
  // Frozen channels: mostly land, a few holes of water.
  frost: { land: 0.95, water: 0.7, air: 0.8 },
  // Land necks across the channels.
  bluffs: { land: 1.1, water: 0.55, air: 0.8 },
  home: { land: 1, water: 0.85, air: 0.8 },
  storm: { land: 1, water: 0.8, air: 0.45 },
  // The channels burn.
  lava: { land: 1, water: 0.1, air: 1.1 },
  reef: { land: 0.7, water: 1.3, air: 0.85 },
  // Open sea: nothing to stand on but the sand bars.
  lagoon: { land: 0, water: 1.3, air: 1.1 },
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

/** May this animal play this world? */
export function allowedOn(id: string, world: string): boolean {
  const def = ANIMALS[id];
  return !!def && worldFit(def, world) >= POOR_FIT;
}

/** Every animal allowed on a world, in the pick screen's order. */
export function allowedAnimals(world: string): string[] {
  return ANIMAL_IDS.filter((id) => allowedOn(id, world));
}

/**
 * `id` if it may play `world`, or else the allowed animal that best fits it (one of the same job first). An online
 * player's pick may not suit the world the host chose; this keeps every animal in a match allowed there.
 */
export function allowedPick(id: string, world: string): string {
  if (allowedOn(id, world)) return id;
  const style = ANIMALS[id]?.style;
  const best = (ids: string[]) => ids.reduce<string | null>((b, x) => (b === null || worldFit(ANIMALS[x], world) > worldFit(ANIMALS[b], world) ? x : b), null);
  const ok = allowedAnimals(world);
  return best(ok.filter((x) => ANIMALS[x].style === style)) ?? best(ok) ?? id;
}

/** Who plays a world, in a few words for the pick screen: "EVERYONE", or the kinds of animal and any odd ones out. */
export function whoPlays(world: string): string {
  const ok = new Set(allowedAnimals(world));
  if (ok.size === ANIMAL_IDS.length) return "EVERYONE";
  const names = { land: "LAND", water: "SWIMMERS", air: "FLYERS" } as const;
  const kinds: string[] = [];
  const extra: string[] = [];
  for (const cls of ["land", "water", "air"] as const) {
    const all = ANIMAL_IDS.filter((id) => ANIMALS[id].cls === cls);
    const some = all.filter((id) => ok.has(id));
    if (some.length === all.length) kinds.push(names[cls]);
    else extra.push(...some.map((id) => ANIMALS[id].name.split(" ").pop()!.toUpperCase()));
  }
  return [kinds.join(" & "), extra.length ? `+ ${extra.join(", ")}` : ""].filter(Boolean).join(" ");
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
