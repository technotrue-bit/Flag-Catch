/**
 * Player settings, kept on the phone: sound levels, chimes, view comfort
 * and control layout. Pure logic over a tiny store so the tests can run it;
 * the game reads `settings` and listens for changes.
 */
import type { Store } from "./progress";

export type CamTurn = "slow" | "normal" | "fast";
/** How much the game draws: Low for older phones, High for shadows, glow, reflections and grass. */
export type Graphics = "low" | "normal" | "high";
export const GRAPHICS: readonly Graphics[] = ["low", "normal", "high"];

export interface Settings {
  /** Camera zoom, 0 out to 1 in. */
  zoom: number;
  /** 0 to 1. */
  music: number;
  sound: number;
  /** Cue chimes for the big moments and the animals' mood tones. */
  chimes: boolean;
  /** Screen shake strength, 0 to 1. */
  shake: number;
  /** Fewer sparks and no lightning flash, for comfort or older phones. */
  calm: boolean;
  /** How quickly the camera swings round behind you. */
  camTurn: CamTurn;
  /** Steer on the right, buttons on the left. */
  leftHanded: boolean;
  bigButtons: boolean;
  /** A short buzz on hits and scores, where the phone allows it. */
  vibrate: boolean;
  /** Phone held upright: the game on a top screen, the map and controls on a bottom one. */
  dsMode: boolean;
  /** Graphics quality. */
  graphics: Graphics;
}

export const DEFAULTS: Readonly<Settings> = {
  zoom: 0.5,
  music: 0.8,
  sound: 0.9,
  chimes: true,
  shake: 1,
  calm: false,
  camTurn: "normal",
  leftHanded: false,
  bigButtons: false,
  vibrate: true,
  dsMode: false,
  graphics: "normal",
};

const KEY = "flagcatch.settings";

const unit = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const pick = <T extends string>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Settings from the store, falling back to the defaults and to the older Zoom and Music keys. */
export function loadSettings(store: Store | null): Settings {
  const s: Settings = { ...DEFAULTS };
  if (!store) return s;
  try {
    const raw = store.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Record<keyof Settings | "voice", unknown>>;
      return {
        zoom: unit(p.zoom, s.zoom),
        music: unit(p.music, s.music),
        sound: unit(p.sound, s.sound),
        // Chimes took the place of the old Voices switch; Voices off keeps them off.
        chimes: bool(p.chimes, p.voice === "off" ? false : s.chimes),
        shake: unit(p.shake, s.shake),
        calm: bool(p.calm, s.calm),
        camTurn: pick(p.camTurn, ["slow", "normal", "fast"], s.camTurn),
        leftHanded: bool(p.leftHanded, s.leftHanded),
        bigButtons: bool(p.bigButtons, s.bigButtons),
        vibrate: bool(p.vibrate, s.vibrate),
        dsMode: bool(p.dsMode, s.dsMode),
        graphics: pick(p.graphics, GRAPHICS, s.graphics),
      };
    }
    // Before this settings card, Zoom and Music had keys of their own.
    const zoom = Number(store.getItem("flagcatch.zoom"));
    if (store.getItem("flagcatch.zoom") !== null && Number.isFinite(zoom)) s.zoom = unit(zoom, s.zoom);
    if (store.getItem("flagcatch.music") === "0") s.music = 0;
  } catch {
    // Unreadable settings: start from the defaults.
  }
  return s;
}

export function saveSettings(store: Store | null, s: Settings): void {
  try {
    store?.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode: settings last until the page closes.
  }
}

/** How fast the camera catches up with your heading, per second. */
export function camTurnRate(s: Settings): number {
  return s.camTurn === "slow" ? 1.5 : s.camTurn === "fast" ? 4 : 2.6;
}

const storage = (() => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
})();

/** The live settings everyone reads. */
export const settings: Settings = loadSettings(storage);
const listeners: Array<(s: Settings) => void> = [];

/** Change one setting, save it and tell whoever listens. */
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  settings[key] = value;
  saveSettings(storage, settings);
  for (const fn of listeners) fn(settings);
}

export function onSettings(fn: (s: Settings) => void): void {
  listeners.push(fn);
}
