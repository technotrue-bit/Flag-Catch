/**
 * Animal stats, in the original's unlock order plus our Turbo Wolf. Each
 * class rules its own ground: land animals are fast on land, water animals
 * fast in water (and can dive), flyers are medium everywhere and climb.
 * Speeds are meters per second.
 */
export type AnimalClass = "land" | "water" | "air";

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

function animal(def: Pick<AnimalDef, "id" | "name" | "cls" | "landSpeed" | "waterSpeed" | "perk"> & Partial<AnimalDef>): AnimalDef {
  return { ...BASE, ...def };
}

export const ANIMALS: Record<string, AnimalDef> = {
  lion: animal({ id: "lion", name: "Rally Lion", cls: "land", landSpeed: 15, waterSpeed: 5, perk: "All rounder, quick on land" }),
  penguin: animal({
    id: "penguin",
    name: "Surf Penguin",
    cls: "water",
    landSpeed: 6.5,
    waterSpeed: 16,
    airSpeed: 9,
    turnRate: 3.8,
    jumpSpeed: 9.5,
    dive: true,
    perk: "Fastest swimmer, dives under shots",
  }),
  croc: animal({
    id: "croc",
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
    name: "Skate Mammoth",
    cls: "land",
    landSpeed: 13,
    waterSpeed: 5,
    airSpeed: 9,
    turnRate: 2.9,
    jumpSpeed: 8,
    toughness: 0.5,
    perk: "Heavy, shrugs off pops fast",
  }),
  wolf: animal({
    id: "wolf",
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
};

export const ANIMAL_IDS = Object.keys(ANIMALS);
