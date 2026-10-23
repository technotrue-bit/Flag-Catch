/**
 * Animal stats. The prototype carries one of each class so land, water and
 * air feel can be judged side by side, plus the wolf's shooter car.
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
  /** One line for the pick screen. */
  perk: string;
}

export const ANIMALS: Record<string, AnimalDef> = {
  lion: {
    id: "lion",
    name: "Rally Lion",
    cls: "land",
    landSpeed: 15,
    waterSpeed: 5,
    airSpeed: 10,
    turnRate: 3.4,
    jumpSpeed: 9,
    floatTime: 0.55,
    climb: 0,
    shotSpeed: 1,
    shotLift: 1,
    shotCooldown: 1,
    perk: "All rounder, quick on land",
  },
  penguin: {
    id: "penguin",
    name: "Surf Penguin",
    cls: "water",
    landSpeed: 6.5,
    waterSpeed: 16,
    airSpeed: 9,
    turnRate: 3.8,
    jumpSpeed: 9.5,
    floatTime: 0.55,
    climb: 0,
    shotSpeed: 1,
    shotLift: 1,
    shotCooldown: 1,
    perk: "Fastest in the water",
  },
  eagle: {
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
    shotSpeed: 1,
    shotLift: 1,
    shotCooldown: 1,
    perk: "Hold Jump to fly",
  },
  wolf: {
    id: "wolf",
    name: "Turbo Wolf",
    cls: "land",
    landSpeed: 17,
    waterSpeed: 4.5,
    airSpeed: 10,
    turnRate: 3.0,
    jumpSpeed: 8.5,
    floatTime: 0.45,
    climb: 0,
    // A launcher on the hood: flatter, faster shots, fired more often.
    shotSpeed: 1.35,
    shotLift: 0.35,
    shotCooldown: 0.55,
    perk: "Fastest car, rapid long shots",
  },
};

export const ANIMAL_IDS = Object.keys(ANIMALS);
