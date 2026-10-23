/**
 * Animal stats. The prototype carries one of each class so land, water and
 * air feel can be judged side by side. Speeds are meters per second.
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
  },
};

export const ANIMAL_IDS = Object.keys(ANIMALS);
