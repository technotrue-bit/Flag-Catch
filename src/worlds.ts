/**
 * The eight worlds. Each one starts from the same three land layout (yours,
 * the middle, theirs), reshaped and repainted, with one twist of its own, and
 * they run from all land to all sea:
 *
 *   Rust Dunes    all land: red sand dunes and flat topped mesas, no water
 *   Frost Floe    the channels froze over, but for a few holes; ice: land animals slide
 *   Bumpy Bluffs  big rolling bumps, lookout bluffs and land necks across the channels
 *   Home Isle     the classic island
 *   Storm Spire   a rock spire in the middle, swirling wind and lightning
 *   Lava Loop     the channels are lava that burns, and the bridges are narrow
 *   Ring Reef     broken rings of reef water cut the lands, swimmers rule
 *   Deep Lagoon   open sea: only a sand bar under each base and gift box
 *
 * Every shape is point symmetric (the same at (u, v) and (-u, -v)) so
 * neither team gets the better ground. Pure data and math: safe in node.
 */
export type WorldId = "home" | "reef" | "bluffs" | "frost" | "lagoon" | "storm" | "dunes" | "lava";

export type TreeStyle = "round" | "palm" | "pine" | "cactus" | "crystal" | "dead";

export interface WorldPalette {
  skyTop: string;
  skyHorizon: string;
  fog: string;
  sand: string;
  grassLow: string;
  grassHigh: string;
  rock: string;
  waterShallow: string;
  waterDeep: string;
  seabed: string;
  foam: string;
  trunk: string;
  leaf: string;
  leafLight: string;
  /** Sky and ground colors of the soft fill light. */
  hemiSky: string;
  hemiGround: string;
  sun: string;
}

export interface WorldDef {
  id: WorldId;
  name: string;
  /** One line for the world pick. */
  blurb: string;
  palette: WorldPalette;
  tree: TreeStyle;
  /** Tree count compared with Home Isle. */
  trees: number;
  /** Flower patch count compared with Home Isle; 0 for none. */
  flowers: number;
  petals: string[];
  fogNear: number;
  fogFar: number;
  /** How deep the two middle lagoons are cut; 1 is Home Isle. */
  lagoons: number;
  /** Bridge deck width compared with Home Isle. */
  bridgeWidth: number;
  /** The channels and sea: water you swim in, or lava that burns. */
  liquid: "water" | "lava";
  /** Land slides like ice. */
  ice: boolean;
  /** Swirling wind and lightning strikes. */
  storm: boolean;
  /**
   * The ground's overall shape: three islands split by channels (with bridges), all land with no water to cross, or
   * open sea with only a sand bar under each base and power up station (no bridges either).
   */
  ground: "isles" | "land" | "sea";
  /**
   * How much of each spot, channels and sea included, is filled in as flat land (0 to 1): land necks across the
   * channels, frozen sheets. Kept off the bases and where bridges land.
   */
  fill?: (u: number, v: number) => number;
  /** Extra height in layout units, already masked off the bases and bridges. */
  shape: (u: number, v: number, land: number) => number;
}

const HOME_PALETTE: WorldPalette = {
  skyTop: "#7cc4f2",
  skyHorizon: "#d9f1ff",
  fog: "#cbe9fa",
  sand: "#f2dca4",
  grassLow: "#8fd16a",
  grassHigh: "#6cbf5a",
  rock: "#b7a99a",
  waterShallow: "#5fd3d6",
  waterDeep: "#3aa6c9",
  seabed: "#2f8fa8",
  foam: "#fffbea",
  trunk: "#a8754f",
  leaf: "#4fb36a",
  leafLight: "#7fd47a",
  hemiSky: "#ffffff",
  hemiGround: "#9fd3a8",
  sun: "#fff6e6",
};

const bump = (du: number, dv: number, spread: number) => Math.exp(-(du * du + dv * dv) / spread);
/** The same bump at (u, v) and (-u, -v), so a shape stays fair. */
const pair = (u: number, v: number, cu: number, cv: number, spread: number) => bump(u - cu, v - cv, spread) + bump(u + cu, v + cv, spread);
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export const WORLDS: readonly WorldDef[] = [
  {
    id: "home",
    name: "Home Isle",
    blurb: "Gentle grass and beaches",
    palette: HOME_PALETTE,
    tree: "round",
    trees: 1,
    flowers: 1,
    petals: ["#ff8fb1", "#ffd166", "#ffffff", "#b3a9ff", "#ff9f6b"],
    fogNear: 80,
    fogFar: 220,
    lagoons: 1,
    bridgeWidth: 1,
    liquid: "water",
    ice: false,
    storm: false,
    ground: "isles",
    shape: () => 0,
  },
  {
    id: "reef",
    name: "Ring Reef",
    blurb: "Reef rings cut the land. Swimmers rule",
    palette: {
      ...HOME_PALETTE,
      skyTop: "#6fb8f0",
      skyHorizon: "#e2f4ff",
      sand: "#f7e4b8",
      grassLow: "#9ad97a",
      grassHigh: "#78c46a",
      rock: "#d9a38f",
      waterShallow: "#4fe0d2",
      waterDeep: "#2a9fc2",
      seabed: "#3fb2b6",
      leaf: "#3fae6e",
      leafLight: "#8ae08a",
    },
    tree: "palm",
    trees: 0.8,
    flowers: 0.6,
    petals: ["#ff7aa8", "#ffffff", "#ffd166"],
    fogNear: 90,
    fogFar: 240,
    lagoons: 1.9,
    bridgeWidth: 1,
    liquid: "water",
    ice: false,
    storm: false,
    ground: "isles",
    shape(u, v, land) {
      // Broken rings of reef water round the middle and each homeland, with
      // four gaps each so land animals can still get through, plus coral rocks.
      const ring = (cu: number, cv: number, r: number) => {
        const du = u - cu;
        const dv = (v - cv) * 0.8;
        const d = Math.hypot(du, dv);
        const a = Math.atan2(dv, du);
        const gaps = smooth((Math.abs(Math.cos(2 * a)) - 0.25) / 0.2);
        return Math.exp(-((d - r) ** 2) / 8) * gaps;
      };
      // Kept dry round the power up stations.
      const dry = 1 - Math.min(1, pair(u, v, 16, 20, 24) + pair(u, v, -18, 16, 24));
      const rings = (ring(0, 0, 21) + ring(0, 70, 17) + ring(0, -70, 17)) * dry;
      const coral = 2.2 * (pair(u, v, 28, 10, 8) + pair(u, v, -30, 52, 10) + pair(u, v, 8, 30, 6));
      return land * (coral - 5.5 * rings);
    },
  },
  {
    id: "bluffs",
    name: "Bumpy Bluffs",
    blurb: "Big bumps, bluffs and land necks. More land",
    palette: {
      ...HOME_PALETTE,
      skyTop: "#f5b38a",
      skyHorizon: "#ffe6cc",
      fog: "#ffe0c4",
      sand: "#f0d39a",
      grassLow: "#b4d468",
      grassHigh: "#8fbf55",
      rock: "#c79b72",
      waterShallow: "#6ccfd0",
      waterDeep: "#4aa0b8",
      trunk: "#9b6a45",
      leaf: "#d98a3c",
      leafLight: "#f2b45a",
      hemiGround: "#d7c08a",
      sun: "#ffe2c0",
    },
    tree: "round",
    trees: 0.8,
    flowers: 0.8,
    petals: ["#ffd166", "#ff9f6b", "#ffffff"],
    fogNear: 80,
    fogFar: 220,
    lagoons: 0.7,
    bridgeWidth: 1,
    liquid: "water",
    ice: false,
    storm: false,
    ground: "isles",
    // Two wide land necks across each channel on the flanks, so land animals can drive round as well as over the
    // bridges.
    fill: (u, v) => {
      const neck = (cu: number, cv: number) => Math.exp(-((u - cu) ** 2) / 45 - ((v - cv) ** 2) / 260);
      return Math.min(1, 1.6 * (neck(26, 36) + neck(-26, 36) + neck(26, -36) + neck(-26, -36)));
    },
    shape(u, v, land) {
      const bumps = 1.5 * Math.cos(u * 0.32) * Math.cos(v * 0.27) + 0.9 * Math.cos(u * 0.19 + v * 0.23) * Math.cos(u * 0.19 - v * 0.23);
      const bluffs = 4.2 * (pair(u, v, 30, 12, 50) + pair(u, v, -26, 58, 45));
      return land * (bumps + bluffs);
    },
  },
  {
    id: "frost",
    name: "Frost Floe",
    blurb: "Frozen channels, icy ground. Land slides",
    palette: {
      ...HOME_PALETTE,
      skyTop: "#9cc9ec",
      skyHorizon: "#eef7ff",
      fog: "#e4f1fb",
      sand: "#dfe9f2",
      grassLow: "#f4f8fc",
      grassHigh: "#e3edf7",
      rock: "#a9b8c9",
      waterShallow: "#7fc3e0",
      waterDeep: "#3f86b8",
      seabed: "#3a6f99",
      foam: "#ffffff",
      trunk: "#7a5a46",
      leaf: "#3f7f6a",
      leafLight: "#e9f3f8",
      hemiSky: "#f2f8ff",
      hemiGround: "#c4d6e6",
      sun: "#f4f8ff",
    },
    tree: "pine",
    trees: 0.9,
    flowers: 0,
    petals: [],
    fogNear: 60,
    fogFar: 190,
    lagoons: 1,
    bridgeWidth: 1,
    liquid: "water",
    ice: true,
    storm: false,
    ground: "isles",
    // The channels have frozen over, all but a few holes of open water (and the water under each bridge).
    fill: (u, v) => {
      // An oval sheet over each channel, so the ice meets the shore in curves rather than straight edges.
      const dv = (Math.abs(v) - 35) / 17;
      const du = u / 42;
      const band = smooth((1 - dv * dv - du * du) / 0.35);
      const holes = Math.min(1, 1.4 * (pair(u, v, 30, 34, 30) + pair(u, v, -2, 38, 22) + pair(u, v, -32, 33, 26)));
      return band * (1 - holes);
    },
    shape(u, v, land) {
      // Smoother and lower than Home Isle, with ice ridges near the shores.
      const ridges = 1.6 * (pair(u, v, 34, 20, 60) + pair(u, v, 20, 100, 70));
      return land * (ridges - 0.6 * Math.cos(u * 0.13) * Math.cos(v * 0.1));
    },
  },
  {
    id: "lagoon",
    name: "Deep Lagoon",
    blurb: "Open sea. Only swimmers and flyers",
    palette: {
      ...HOME_PALETTE,
      skyTop: "#5aa9ea",
      skyHorizon: "#d6f0ff",
      waterShallow: "#3fd0e0",
      waterDeep: "#1f7fbf",
      seabed: "#1e6f9f",
      leaf: "#2fa36a",
      leafLight: "#6fd98a",
    },
    tree: "palm",
    trees: 0.6,
    flowers: 0.5,
    petals: ["#ff8fb1", "#ffffff"],
    fogNear: 90,
    fogFar: 250,
    lagoons: 2,
    bridgeWidth: 1,
    liquid: "water",
    ice: false,
    storm: false,
    ground: "sea",
    shape(u, v, land) {
      // Sink all the land: only open sea is left, with a sand bar under each power up station (the bases keep theirs).
      const keep = bump(u, v, 26) + pair(u, v, 16, 20, 26) + pair(u, v, -18, 16, 26) + pair(u, v, -12, 52, 26) + pair(u, v, 0, 22, 26) + pair(u, v, -24, 60, 26);
      return land * (-6 + 6.4 * Math.min(1, keep));
    },
  },
  {
    id: "storm",
    name: "Storm Spire",
    blurb: "Wind swirls and lightning strikes",
    palette: {
      ...HOME_PALETTE,
      skyTop: "#6f7fa6",
      skyHorizon: "#c3cbe0",
      fog: "#b9c3d9",
      sand: "#d8cfb4",
      grassLow: "#7fb27a",
      grassHigh: "#5f9a68",
      rock: "#8f8aa0",
      waterShallow: "#5fb3c0",
      waterDeep: "#3a7f9f",
      seabed: "#2f6a86",
      leaf: "#3f8a5f",
      leafLight: "#6fb27f",
      hemiSky: "#dfe4f2",
      hemiGround: "#7f9a8a",
      sun: "#e8ecff",
    },
    tree: "round",
    trees: 0.6,
    flowers: 0.4,
    petals: ["#b3a9ff", "#ffffff"],
    fogNear: 70,
    fogFar: 210,
    lagoons: 0.6,
    bridgeWidth: 1,
    liquid: "water",
    ice: false,
    storm: true,
    ground: "isles",
    shape(u, v, land) {
      // Flatter open ground and a tall rock spire in the middle.
      const d = Math.hypot(u, v);
      const spire = 11 * smooth(1 - (d - 2) / 5);
      return land * (spire - 0.7 * Math.cos(u * 0.13) * Math.cos(v * 0.1));
    },
  },
  {
    id: "dunes",
    name: "Rust Dunes",
    blurb: "All land: red dunes and mesas, no water",
    palette: {
      ...HOME_PALETTE,
      skyTop: "#f0a36f",
      skyHorizon: "#ffe1c2",
      fog: "#f6cfa8",
      sand: "#f0b47a",
      grassLow: "#e39a5f",
      grassHigh: "#cf7f4a",
      rock: "#b5603f",
      waterShallow: "#5fc9c9",
      waterDeep: "#3a9aa8",
      seabed: "#a8704f",
      foam: "#fff1dc",
      trunk: "#8a5a3b",
      leaf: "#6faf5a",
      leafLight: "#9fd47a",
      hemiSky: "#fff0e0",
      hemiGround: "#d98f5f",
      sun: "#ffe0bf",
    },
    tree: "cactus",
    trees: 0.5,
    flowers: 0.25,
    petals: ["#ff6b9a", "#ffd166"],
    fogNear: 60,
    fogFar: 190,
    lagoons: 0,
    bridgeWidth: 1,
    liquid: "water",
    ice: false,
    storm: false,
    ground: "land",
    shape(u, v, land) {
      const dunes = 1.1 * Math.cos(u * 0.42 + v * 0.18) * Math.cos(u * 0.42 - v * 0.18);
      // Mesas: steep sided, flat on top.
      const mesa = (cu: number, cv: number, r: number) => {
        const a = smooth((r - Math.hypot(u - cu, v - cv)) / 3);
        const b = smooth((r - Math.hypot(u + cu, v + cv)) / 3);
        return a + b;
      };
      const mesas = 5 * (mesa(28, 14, 7) + mesa(-30, 56, 8) + mesa(-12, 24, 4));
      return land * (dunes + mesas);
    },
  },
  {
    id: "lava",
    name: "Lava Loop",
    blurb: "Lava burns, bridges are narrow. The hardest",
    palette: {
      ...HOME_PALETTE,
      skyTop: "#4a3550",
      skyHorizon: "#c9785a",
      fog: "#8f5a52",
      sand: "#5a4a50",
      grassLow: "#6f6066",
      grassHigh: "#5a4d55",
      rock: "#3f3540",
      waterShallow: "#ff7a2f",
      waterDeep: "#e8452c",
      seabed: "#ff9f1c",
      foam: "#ffd166",
      trunk: "#3a2f36",
      leaf: "#2f2730",
      leafLight: "#4a3f48",
      hemiSky: "#ffd2b0",
      hemiGround: "#ff7a4a",
      sun: "#ffc79a",
    },
    tree: "dead",
    trees: 0.5,
    flowers: 0,
    petals: [],
    fogNear: 60,
    fogFar: 200,
    lagoons: 0,
    bridgeWidth: 0.55,
    liquid: "lava",
    ice: false,
    storm: false,
    ground: "isles",
    shape(u, v, land) {
      // Craggy rock with a few vents.
      const crags = 1.2 * Math.cos(u * 0.3) * Math.cos(v * 0.22) + 2.6 * (pair(u, v, 26, 16, 20) + pair(u, v, -28, 54, 24));
      return land * crags;
    },
  },
];

export const WORLD_IDS = WORLDS.map((w) => w.id);

export function worldById(id: string): WorldDef {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}
