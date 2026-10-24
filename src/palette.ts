/**
 * One place for every color. Bright but soft: nothing pure white or fully
 * saturated, so a long session stays easy on the eyes.
 */
export const PALETTE = {
  skyTop: "#7cc4f2",
  skyHorizon: "#d9f1ff",
  fog: "#cbe9fa",
  sand: "#f2dca4",
  grassLow: "#8fd16a",
  grassHigh: "#6cbf5a",
  rock: "#b7a99a",
  waterShallow: "#5fd3d6",
  waterDeep: "#3aa6c9",
  trunk: "#a8754f",
  leaf: "#4fb36a",
  leafLight: "#7fd47a",
  ink: "#2b2340",
};

/** Your team is blue and the rivals are red, with a shape too for color blind players. */
export const TEAMS = [
  { name: "Blue Team", color: "#3d8bff", light: "#a9ccff", shape: "sun" },
  { name: "Red Team", color: "#ff4f5e", light: "#ffb3ba", shape: "moon" },
] as const;

/** The glow that marks your own animal. */
export const ME_GLOW = "#ffd166";

export const FLAG_FREE = "#7ee36b";
export const FLAG_ENEMY = "#ff5a6e";
