import { describe, expect, it } from "vitest";
import { DEFAULTS, camTurnRate, loadSettings, saveSettings } from "./settings";
import { moodNotes, scaleStep } from "./audio";
import { PRIORITY, TUNES, mayCue, tuneLength } from "./cues";

const memory = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("settings", () => {
  it("start from the defaults", () => {
    expect(loadSettings(memory())).toEqual(DEFAULTS);
    expect(loadSettings(null)).toEqual(DEFAULTS);
  });

  it("save and load every setting", () => {
    const store = memory();
    const s = { ...DEFAULTS, music: 0.3, chimes: false, leftHanded: true, camTurn: "slow" as const, calm: true, dsMode: true };
    saveSettings(store, s);
    expect(loadSettings(store)).toEqual(s);
  });

  it("keep the Zoom and Music switch players set before the settings card", () => {
    const s = loadSettings(memory({ "flagcatch.zoom": "0.8", "flagcatch.music": "0" }));
    expect(s.zoom).toBe(0.8);
    expect(s.music).toBe(0);
  });

  it("ignore broken or out of range values", () => {
    const s = loadSettings(memory({ "flagcatch.settings": JSON.stringify({ music: 7, chimes: "loud", shake: "lots", leftHanded: "yes" }) }));
    expect(s.music).toBe(1);
    expect(s.chimes).toBe(DEFAULTS.chimes);
    expect(s.shake).toBe(DEFAULTS.shake);
    expect(s.leftHanded).toBe(false);
    expect(loadSettings(memory({ "flagcatch.settings": JSON.stringify({ dsMode: "on" }) })).dsMode).toBe(false);
    expect(loadSettings(memory({ "flagcatch.settings": "{oops" }))).toEqual(DEFAULTS);
  });

  it("turn the camera slower or faster", () => {
    expect(camTurnRate({ ...DEFAULTS, camTurn: "slow" })).toBeLessThan(camTurnRate(DEFAULTS));
    expect(camTurnRate({ ...DEFAULTS, camTurn: "fast" })).toBeGreaterThan(camTurnRate(DEFAULTS));
  });
});

it("turn chimes off for players who had Voices off", () => {
  const saved = (voice: string) => memory({ "flagcatch.settings": JSON.stringify({ ...DEFAULTS, chimes: undefined, voice }) });
  expect(loadSettings(saved("off")).chimes).toBe(false);
  expect(loadSettings(saved("announcer")).chimes).toBe(true);
  expect(loadSettings(saved("chatter")).chimes).toBe(true);
  expect("voice" in loadSettings(saved("off"))).toBe(false);
});

describe("cue chimes", () => {
  // F major: F G A Bb C D E.
  const inKey = (m: number) => [0, 2, 4, 5, 7, 9, 11].includes((((m - 65) % 12) + 12) % 12);

  it("has a tune and a priority for every cue, in key and short", () => {
    for (const k of Object.keys(TUNES) as Array<keyof typeof TUNES>) {
      expect(TUNES[k].length).toBeGreaterThan(0);
      expect(PRIORITY[k]).toBeGreaterThan(0);
      expect(tuneLength(k)).toBeLessThan(1.6);
      for (const x of TUNES[k]) {
        expect(inKey(x.m)).toBe(true);
        // High enough for a phone speaker, low enough not to sting.
        expect(x.m).toBeGreaterThanOrEqual(69);
        expect(x.m).toBeLessThanOrEqual(101);
      }
    }
  });

  it("lets a bigger cue cut in, but not a smaller one, and doesn't nag", () => {
    const busy = { until: 1000, priority: 3 };
    expect(mayCue("score", 500, busy)).toBe(true);
    expect(mayCue("knockout", 500, busy)).toBe(false);
    expect(mayCue("knockout", 1500, busy)).toBe(true);
    expect(mayCue("theyGrab", 3000, { until: 0, priority: 0 }, 1000)).toBe(false);
    expect(mayCue("theyGrab", 6000, { until: 0, priority: 0 }, 1000)).toBe(true);
    // Big cues like your own score are never held back for repeating.
    expect(mayCue("score", 3000, { until: 0, priority: 0 }, 2000)).toBe(true);
  });

  it("gives each animal mood a short tune on the pentatonic scale", () => {
    const penta = (m: number) => [0, 2, 4, 7, 9].includes((((m - 65) % 12) + 12) % 12);
    expect(scaleStep(77, 1)).toBe(79);
    expect(scaleStep(77, 3)).toBe(84);
    expect(scaleStep(77, -1)).toBe(74);
    expect(scaleStep(77, 5)).toBe(89);
    for (const animal of ["lion", "mammoth", "bat", "nobody"]) {
      for (const mood of ["happy", "cheer", "sad", "ouch"] as const) {
        const notes = moodNotes(animal, mood);
        expect(notes.length).toBeGreaterThan(0);
        for (const x of notes) expect(penta(x.m)).toBe(true);
      }
    }
    expect(moodNotes("lion", "happy")[1].m).toBeGreaterThan(moodNotes("lion", "happy")[0].m);
    expect(moodNotes("lion", "sad")[1].m).toBeLessThan(moodNotes("lion", "sad")[0].m);
  });
});
