import { describe, expect, it } from "vitest";
import { mulberry32 } from "./rng";
import { NO_INPUT, STEP, createMatch, matchState, restoreMatch, step } from "./sim";
import { PREFIX, fill } from "./mirror";
import { PROGRESS_KEY, award, fresh, load, save, type Store } from "./progress";

const opts = { seed: 9, humanAnimal: "lion", perTeam: 8, duration: 240, flagsPerTeam: 1, world: "home" } as const;

describe("saved matches", () => {
  it("the random rolls are the same as before the generator kept its state", () => {
    // The first rolls of seed 1 from the old closure version, so old seeds still replay the same matches.
    const old = (seed: number) => {
      let a = seed >>> 0 || 1;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    for (const seed of [1, 42, 123456789, 4e9]) {
      const a = old(seed);
      const b = mulberry32(seed);
      for (let i = 0; i < 50; i++) expect(b()).toBe(a());
    }
  });

  it("a match put back from its saved state plays on exactly as the original", () => {
    const a = createMatch(opts);
    for (let i = 0; i < 40 / STEP; i++) step(a, NO_INPUT);
    // Through text, the way it is stored.
    const saved = JSON.parse(JSON.stringify(matchState(a)));
    const b = createMatch({ ...opts, seed: 1 });
    expect(restoreMatch(b, saved)).toBe(true);
    for (let i = 0; i < 40 / STEP; i++) {
      step(a, NO_INPUT);
      step(b, NO_INPUT);
    }
    expect(b.time).toBeCloseTo(a.time, 9);
    expect(b.scores).toEqual(a.scores);
    expect(b.players.map((p) => [p.x, p.z, p.def.id, p.hp])).toEqual(a.players.map((p) => [p.x, p.z, p.def.id, p.hp]));
    expect(b.flags.map((f) => [f.state, f.x, f.z])).toEqual(a.flags.map((f) => [f.state, f.x, f.z]));
  });

  it("a saved state that doesn't fit the match is turned away and changes nothing", () => {
    const a = createMatch(opts);
    for (let i = 0; i < 5 / STEP; i++) step(a, NO_INPUT);
    const saved = matchState(a);
    const big = createMatch({ ...opts, perTeam: 16 });
    const before = JSON.stringify(matchState(big));
    expect(restoreMatch(big, saved)).toBe(false);
    expect(JSON.stringify(matchState(big))).toBe(before);
    expect(restoreMatch(createMatch(opts), null)).toBe(false);
    expect(restoreMatch(createMatch(opts), { ...saved, v: 2 })).toBe(false);
    expect(restoreMatch(createMatch(opts), { ...saved, match: { ...saved.match, over: true } })).toBe(false);
  });
});

function memStore(init: Record<string, string> = {}): Store & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("the site's copy of the save", () => {
  it("brings back everything a fresh frame lost", () => {
    const store = memStore();
    fill(store, { [`${PREFIX}settings`]: '{"music":0}', [`${PREFIX}animal`]: "croc", [PROGRESS_KEY]: '{"dev":{"abc":{"points":500,"played":3,"wins":2}}}' });
    expect(store.getItem(`${PREFIX}animal`)).toBe("croc");
    expect(store.getItem(`${PREFIX}settings`)).toBe('{"music":0}');
    expect(load(store).points).toBe(500);
  });

  it("keeps this visit's own values, and adds both devices' points together", () => {
    const store = memStore({ [`${PREFIX}animal`]: "lion" });
    const here = fresh();
    award(here, "home", 30, "win", "phone");
    save(store, here);
    fill(store, { [`${PREFIX}animal`]: "croc", [PROGRESS_KEY]: '{"dev":{"tablet":{"points":200,"played":1,"wins":0}}}' });
    expect(store.getItem(`${PREFIX}animal`)).toBe("lion");
    expect(load(store).points).toBe(330);
  });

  it("ignores other keys and anything that isn't text", () => {
    const store = memStore();
    fill(store, { other: "x", [`${PREFIX}size`]: 16, [`${PREFIX}mode`]: "hoard" });
    fill(store, null);
    fill(store, "nope");
    expect([...store.data.keys()]).toEqual([`${PREFIX}mode`]);
  });
});
