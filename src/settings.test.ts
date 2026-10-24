import { describe, expect, it } from "vitest";
import { DEFAULTS, camTurnRate, loadSettings, saveSettings } from "./settings";
import { LINES, PRIORITY, lineFor, mayAnnounce } from "./voice";

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
    const s = { ...DEFAULTS, music: 0.3, voice: "chatter" as const, leftHanded: true, camTurn: "slow" as const, calm: true };
    saveSettings(store, s);
    expect(loadSettings(store)).toEqual(s);
  });

  it("keep the Zoom and Music switch players set before the settings card", () => {
    const s = loadSettings(memory({ "flagcatch.zoom": "0.8", "flagcatch.music": "0" }));
    expect(s.zoom).toBe(0.8);
    expect(s.music).toBe(0);
  });

  it("ignore broken or out of range values", () => {
    const s = loadSettings(memory({ "flagcatch.settings": JSON.stringify({ music: 7, voice: "shout", shake: "lots", leftHanded: "yes" }) }));
    expect(s.music).toBe(1);
    expect(s.voice).toBe(DEFAULTS.voice);
    expect(s.shake).toBe(DEFAULTS.shake);
    expect(s.leftHanded).toBe(false);
    expect(loadSettings(memory({ "flagcatch.settings": "{oops" }))).toEqual(DEFAULTS);
  });

  it("turn the camera slower or faster", () => {
    expect(camTurnRate({ ...DEFAULTS, camTurn: "slow" })).toBeLessThan(camTurnRate(DEFAULTS));
    expect(camTurnRate({ ...DEFAULTS, camTurn: "fast" })).toBeGreaterThan(camTurnRate(DEFAULTS));
  });
});

describe("announcer", () => {
  it("has a line and a priority for every call", () => {
    for (const k of Object.keys(LINES) as Array<keyof typeof LINES>) {
      expect(LINES[k].length).toBeGreaterThan(0);
      expect(PRIORITY[k]).toBeGreaterThan(0);
    }
  });

  it("never says the same line twice in a row", () => {
    let prev = "";
    for (let i = 0; i < 40; i++) {
      const line = lineFor("grab", 0.1);
      expect(line).not.toBe(prev);
      prev = line;
    }
  });

  it("lets a bigger call cut in, but not a smaller one, and doesn't nag", () => {
    const busy = { until: 1000, priority: 3 };
    expect(mayAnnounce("score", 500, busy)).toBe(true);
    expect(mayAnnounce("knockout", 500, busy)).toBe(false);
    expect(mayAnnounce("knockout", 1500, busy)).toBe(true);
    expect(mayAnnounce("theyGrab", 3000, { until: 0, priority: 0 }, 1000)).toBe(false);
    expect(mayAnnounce("theyGrab", 8000, { until: 0, priority: 0 }, 1000)).toBe(true);
    // Big calls like your own score are never held back for repeating.
    expect(mayAnnounce("score", 3000, { until: 0, priority: 0 }, 2000)).toBe(true);
  });
});
