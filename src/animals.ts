/**
 * Animal stats, in the original's unlock order plus our Turbo Wolf. Each
 * class rules its own ground: land animals are fast on land, water animals
 * fast in water (and can dive), flyers are medium everywhere and climb.
 * Speeds are meters per second.
 */
export type AnimalClass = "land" | "water" | "air";

/**
 * How a CPU animal likes to play, the way a real player picks a job that
 * suits their animal. Raiders steal and run flags home, hunters run down
 * thieves, guardians hold home and bodyguard carriers, bombers clear the
 * way from the air, and all rounders fill whatever the team is short of.
 */
export type Style = "raider" | "hunter" | "guardian" | "bomber" | "allrounder";

export const STYLE_NAMES: Record<Style, string> = {
  raider: "Raider",
  hunter: "Hunter",
  guardian: "Guardian",
  bomber: "Bomber",
  allrounder: "All rounder",
};

export interface AnimalDef {
  id: string;
  name: string;
  cls: AnimalClass;
  landSpeed: number;
  waterSpeed: number;
  airSpeed: number;
  /** Radians per second at full stick. */
  turnRate: number;
  jumpSpeed: number;
  /** Seconds of hold-to-float after a jump. Flyers get much more. */
  floatTime: number;
  /** Upward push while holding jump in the air (flyers only climb). */
  climb: number;
  /** Firecracker multipliers: launch speed, arc lift and cooldown. */
  shotSpeed: number;
  shotLift: number;
  shotCooldown: number;
  /** Can hold Dive in water to slip under firecrackers. */
  dive: boolean;
  /** Throwing while high in the air drops a bomb straight down instead. */
  bomber: boolean;
  /** Stun and knockback multiplier when popped; under 1 shrugs it off faster. */
  toughness: number;
  /** One line for the pick screen. */
  perk: string;
  /** The job its CPU plays best. */
  style: Style;
  /** How well it holds the road on ice; the default slides. */
  iceGrip?: number;
}

const BASE = {
  airSpeed: 10,
  turnRate: 3.4,
  jumpSpeed: 9,
  floatTime: 0.55,
  climb: 0,
  shotSpeed: 1,
  shotLift: 1,
  shotCooldown: 1,
  dive: false,
  bomber: false,
  toughness: 1,
};

function animal(def: Pick<AnimalDef, "id" | "name" | "cls" | "landSpeed" | "waterSpeed" | "perk" | "style"> & Partial<AnimalDef>): AnimalDef {
  return { ...BASE, ...def };
}

export const ANIMALS: Record<string, AnimalDef> = {
  lion: animal({ id: "lion", style: "allrounder", name: "Rally Lion", cls: "land", landSpeed: 15, waterSpeed: 5, perk: "All rounder, quick on land" }),
  penguin: animal({
    id: "penguin",
    style: "raider",
    name: "Surf Penguin",
    cls: "water",
    landSpeed: 6.5,
    waterSpeed: 16,
    airSpeed: 9,
    turnRate: 3.8,
    jumpSpeed: 9.5,
    dive: true,
    iceGrip: 7,
    perk: "Swift swimmer, dives, grips on ice",
  }),
  croc: animal({
    id: "croc",
    style: "guardian",
    name: "Ski Croc",
    cls: "water",
    landSpeed: 8,
    waterSpeed: 14.5,
    airSpeed: 8.5,
    turnRate: 3.2,
    jumpSpeed: 8.5,
    dive: true,
    toughness: 0.75,
    perk: "Dives, tough hide, better on land",
  }),
  bird: animal({
    id: "bird",
    style: "hunter",
    name: "Moto Bird",
    cls: "land",
    landSpeed: 14,
    waterSpeed: 5.5,
    airSpeed: 11,
    turnRate: 4.2,
    jumpSpeed: 11,
    floatTime: 0.95,
    perk: "Sharp turns and big hops",
  }),
  eagle: animal({
    id: "eagle",
    style: "bomber",
    name: "Sky Eagle",
    cls: "air",
    landSpeed: 10.5,
    waterSpeed: 10,
    airSpeed: 12.5,
    turnRate: 3.0,
    jumpSpeed: 8,
    floatTime: 3.2,
    climb: 26,
    bomber: true,
    perk: "Hold Jump to fly, Throw in the air drops bombs",
  }),
  mammoth: animal({
    id: "mammoth",
    style: "guardian",
    name: "Skate Mammoth",
    cls: "land",
    landSpeed: 13,
    waterSpeed: 5,
    airSpeed: 9,
    turnRate: 2.9,
    jumpSpeed: 8,
    toughness: 0.5,
    iceGrip: 4,
    perk: "Heavy, shrugs off pops fast",
  }),
  wolf: animal({
    id: "wolf",
    style: "hunter",
    name: "Turbo Wolf",
    cls: "land",
    landSpeed: 17,
    waterSpeed: 4.5,
    turnRate: 3.0,
    jumpSpeed: 8.5,
    floatTime: 0.45,
    // A launcher on the hood: flatter, faster shots, fired more often.
    shotSpeed: 1.35,
    shotLift: 0.35,
    shotCooldown: 0.55,
    perk: "Fastest car, rapid long shots",
  }),
  shark: animal({
    id: "shark",
    style: "raider",
    name: "Jet Shark",
    cls: "water",
    landSpeed: 5.5,
    waterSpeed: 18,
    airSpeed: 8.5,
    turnRate: 3.0,
    jumpSpeed: 9,
    dive: true,
    toughness: 0.85,
    perk: "Fastest in the water, slow on land",
  }),
  goldfish: animal({
    id: "goldfish",
    style: "allrounder",
    name: "Bowl Goldfish",
    cls: "water",
    landSpeed: 12,
    waterSpeed: 12.5,
    airSpeed: 9,
    turnRate: 4.6,
    jumpSpeed: 9.5,
    floatTime: 0.7,
    perk: "Rolls in a bowl: as good on land as in water",
  }),
  panther: animal({
    id: "panther",
    style: "raider",
    name: "Dash Panther",
    cls: "land",
    landSpeed: 16,
    waterSpeed: 4.5,
    turnRate: 4.5,
    jumpSpeed: 9.5,
    perk: "Fast on land with razor sharp turns",
  }),
  flyfish: animal({
    id: "flyfish",
    style: "raider",
    name: "Glide Fish",
    cls: "air",
    landSpeed: 7,
    waterSpeed: 13.5,
    airSpeed: 11.5,
    turnRate: 3.3,
    jumpSpeed: 10,
    floatTime: 2.6,
    climb: 20,
    dive: true,
    perk: "Swims, dives and flies",
  }),
  bat: animal({
    id: "bat",
    style: "raider",
    name: "Night Bat",
    cls: "air",
    landSpeed: 9,
    waterSpeed: 6,
    airSpeed: 14,
    turnRate: 3.6,
    jumpSpeed: 8.5,
    floatTime: 3.6,
    climb: 30,
    shotCooldown: 0.7,
    toughness: 1.2,
    perk: "Fastest flyer, quick throws, fragile",
  }),
  frog: animal({
    id: "frog",
    style: "hunter",
    name: "Pogo Frog",
    cls: "water",
    landSpeed: 11.5,
    waterSpeed: 13,
    airSpeed: 10,
    turnRate: 3.6,
    jumpSpeed: 14,
    floatTime: 0.9,
    dive: true,
    perk: "Giant pogo jumps, dives in water",
  }),
};

export const ANIMAL_IDS = Object.keys(ANIMALS);
