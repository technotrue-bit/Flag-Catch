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

/** Team colors stay apart for color blind players: warm vs cool plus a shape. */
export const TEAMS = [
  { name: "Sunburst", color: "#ff8a4c", light: "#ffc29a", shape: "sun" },
  { name: "Nightshade", color: "#6c5ce7", light: "#b3a9ff", shape: "moon" },
] as const;

export const FLAG_FREE = "#7ee36b";
export const FLAG_ENEMY = "#ff5a6e";
