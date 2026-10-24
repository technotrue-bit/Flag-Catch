import { describe, expect, it } from "vitest";
import { ANIMAL_IDS } from "./animals";
import * as progress from "./progress";
import { type Input, NO_INPUT, STEP, createMatch, step } from "./sim";
import { MAPS, WORLD_HALF_X, WORLD_HALF_Z, groundHeight, isLava, isWater } from "./terrain";
import { WORLDS } from "./worlds";

const opts = { seed: 3, humanAnimal: "lion", perTeam: 4, duration: 60, flagsPerTeam: 5 };

describe("worlds", () => {
  it("every world is the same for both teams at every team size, with dry bases, flags and stations", () => {
    for (const w of WORLDS) {
      for (const map of MAPS) {
        const m = createMatch({ ...opts, perTeam: map.size, flagsPerTeam: map.flagsPerTeam, map, world: w.id });
        let worst = 0;
        for (let i = 0; i < 400; i++) {
          const x = ((i * 37) % 101) / 50 - 1;
          const z = ((i * 61) % 97) / 48 - 1;
          worst = Math.max(worst, Math.abs(groundHeight(x * WORLD_HALF_X, z * WORLD_HALF_Z) - groundHeight(-x * WORLD_HALF_X, -z * WORLD_HALF_Z)));
        }
        expect(worst, `${w.id} ${map.name}`).toBeLessThan(1e-9);
        expect(m.flags.filter((f) => isWater(f.x, f.z)), `${w.id} flags`).toEqual([]);
        expect(m.stations.filter((s) => isWater(s.x, s.z)), `${w.id} stations`).toEqual([]);
        expect(m.players.filter((p) => isWater(p.x, p.z)), `${w.id} spawns`).toEqual([]);
      }
    }
  });

  it("CPU animals are mirrored slot by slot, and your rival in slot one rides your animal", () => {
    const m = createMatch({ ...opts, perTeam: 16, humanAnimal: "bat" });
    const half = m.players.length / 2;
    expect(m.players[half].def.id).toBe("bat");
    for (let i = 1; i < half; i++) expect(m.players[half + i].def.id).toBe(m.players[i].def.id);
  });

  it("on Frost Floe a land animal keeps sliding after it turns; the penguin grips better", () => {
    const drift = (animal: string) => {
      const m = createMatch({ ...opts, perTeam: 1, humanAnimal: animal, world: "frost" });
      m.players[1].stun = 999;
      const p = m.players[0];
      const go = (dirX: number, dirZ: number, seconds: number) => {
        for (let i = 0; i < seconds / STEP; i++) step(m, { ...NO_INPUT, dirX, dirZ } as Input);
      };
      // Run toward the middle, then swing hard to the side and see how much of the old way is left.
      go(0, -1, 1.5);
      const z0 = p.z;
      go(1, 0, 0.5);
      return z0 - p.z;
    };
    const home = (() => {
      const m = createMatch({ ...opts, perTeam: 1, world: "home" });
      m.players[1].stun = 999;
      const p = m.players[0];
      for (let i = 0; i < 1.5 / STEP; i++) step(m, { ...NO_INPUT, dirZ: -1 } as Input);
      const z0 = p.z;
      for (let i = 0; i < 0.5 / STEP; i++) step(m, { ...NO_INPUT, dirX: 1 } as Input);
      return z0 - p.z;
    })();
    const lion = drift("lion");
    expect(lion).toBeGreaterThan(home + 1);
    expect(drift("penguin")).toBeLessThan(lion);
  });

  it("on Lava Loop the lava burns and throws you back toward land", () => {
    const m = createMatch({ ...opts, perTeam: 1, world: "lava" });
    m.players[1].stun = 999;
    const p = m.players[0];
    // Find lava next to the home shore and drop the lion in it.
    let spot: [number, number] | null = null;
    for (let x = -40; x <= 40 && !spot; x += 1) for (let z = 20; z <= 60 && !spot; z += 1) if (isLava(x, z) && groundHeight(x, z) < -1) spot = [x, z];
    expect(spot).not.toBeNull();
    [p.x, p.z] = spot!;
    p.y = 0;
    const hp = p.hp;
    const kinds: string[] = [];
    for (let i = 0; i < 0.3 / STEP; i++) {
      step(m, NO_INPUT);
      for (const e of m.events) kinds.push(e.kind);
    }
    expect(kinds).toContain("burn");
    expect(p.hp).toBe(hp - 1);
    expect(p.onSurface).toBe(false);
    expect(Math.hypot(p.kx, p.kz)).toBeGreaterThan(5);
  });

  it("Home Isle has no lava, and its water never burns", () => {
    createMatch({ ...opts, world: "home" });
    for (let x = -40; x <= 40; x += 4) for (let z = -120; z <= 120; z += 4) expect(isLava(x, z)).toBe(false);
  });

  it("on Storm Spire lightning warns first, lands on both teams in turn, and the wind turns", () => {
    const m = createMatch({ ...opts, perTeam: 4, world: "storm", duration: 60 });
    const warns: Array<{ x: number; z: number }> = [];
    const turns: number[] = [];
    let close = 0;
    let strikes = 0;
    const winds = new Set<string>();
    for (let i = 0; i < 40 / STEP; i++) {
      step(m, NO_INPUT);
      for (const e of m.events) {
        if (e.kind === "strike_warn") {
          warns.push(e);
          turns.push(m.strikeTeam);
          if (m.players.some((p) => Math.hypot(p.x - e.x, p.z - e.z) < 6)) close++;
        }
        if (e.kind === "strike") strikes++;
      }
      if (i % 600 === 0) winds.add(`${Math.sign(Math.round(m.wind[0]))},${Math.sign(Math.round(m.wind[1]))}`);
    }
    expect(warns.length).toBeGreaterThanOrEqual(4);
    expect(strikes).toBeGreaterThanOrEqual(warns.length - 1);
    // Each lands near an animal, on one team then the other.
    expect(close).toBe(warns.length);
    for (let i = 1; i < turns.length; i++) expect(turns[i]).not.toBe(turns[i - 1]);
    expect(winds.size).toBeGreaterThanOrEqual(3);
  });

  it("Playful: one flag a side, and a banked flag goes straight back to its owners", () => {
    const m = createMatch({ ...opts, mode: "playful" });
    expect(m.flags.length).toBe(2);
    const p = m.players[0];
    m.players.forEach((o, i) => i && (o.stun = 999));
    const theirs = m.flags.find((f) => f.team === 1)!;
    theirs.state = "carried";
    theirs.carrier = p.id;
    p.carrying = theirs.id;
    [p.x, p.z] = [m.bases[0].x, m.bases[0].z];
    step(m, NO_INPUT);
    expect(m.scores[0]).toBe(1);
    expect(theirs.state).toBe("home");
    expect(theirs.team).toBe(1);
    expect(theirs.base).toBe(1);
  });

  it("Capture with one flag a side: one big flag in the middle of each base, back to its owners after a score", () => {
    const m = createMatch({ ...opts, flagsPerTeam: 1 });
    expect(m.flags.length).toBe(2);
    for (const f of m.flags) {
      expect(f.owner).toBe(f.team);
      expect([f.x, f.z]).toEqual([m.bases[f.team].x, m.bases[f.team].z]);
    }
    const p = m.players[0];
    m.players.forEach((o, i) => i && (o.stun = 999));
    const theirs = m.flags.find((f) => f.owner === 1)!;
    theirs.state = "carried";
    theirs.carrier = p.id;
    p.carrying = theirs.id;
    [p.x, p.z] = [m.bases[0].x, m.bases[0].z];
    step(m, NO_INPUT);
    expect(m.scores[0]).toBe(1);
    expect(theirs.state).toBe("home");
    expect(theirs.base).toBe(1);
    expect([theirs.x, theirs.z]).toEqual([m.bases[1].x, m.bases[1].z]);
  });

  it("Hoard keeps its piles: a banked flag stays with the scorers but still wears its owners' color", () => {
    const m = createMatch({ ...opts, mode: "hoard" });
    expect(m.flags.length).toBe(10);
    const p = m.players[0];
    m.players.forEach((o, i) => i && (o.stun = 999));
    const theirs = m.flags.find((f) => f.owner === 1)!;
    theirs.state = "carried";
    theirs.carrier = p.id;
    p.carrying = theirs.id;
    [p.x, p.z] = [m.bases[0].x, m.bases[0].z];
    step(m, NO_INPUT);
    expect(theirs.team).toBe(0);
    expect(theirs.owner).toBe(1);
  });
});

describe("progress", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };

  it("a new player starts with the lion, the wolf, Home Isle and two modes", () => {
    const open = progress.unlocked(progress.load(memory()));
    expect([...open].sort()).toEqual(["capture", "home", "hoard", "lion", "wolf"].sort());
  });

  it("every animal, world and mode is somewhere on the track", () => {
    const all = progress.unlocked(progress.fresh(), true);
    for (const id of ANIMAL_IDS) expect(all.has(id), id).toBe(true);
    for (const w of WORLDS) expect(all.has(w.id), w.id).toBe(true);
    expect(all.has("playful")).toBe(true);
  });

  it("a match pays your points plus a win bonus, keeps the best per world and opens what you reached", () => {
    const store = memory();
    const p = progress.load(store);
    const a = progress.award(p, "home", 60, "win");
    expect(a.gained).toBe(60 + progress.WIN_BONUS);
    expect(a.record).toBe(true);
    expect(a.opened.sort()).toEqual(["penguin", "reef"]);
    const b = progress.award(p, "home", 30, "loss");
    expect(b.gained).toBe(30);
    expect(b.record).toBe(false);
    progress.save(store, p);
    const again = progress.load(store);
    expect(again.points).toBe(190);
    expect(again.best.home).toBe(60);
    expect(again.played).toBe(2);
  });

  it("players from before unlocks keep the first seven animals", () => {
    const store = memory();
    store.setItem("flagcatch.size", "8");
    const open = progress.unlocked(progress.load(store));
    for (const id of ["lion", "penguin", "croc", "bird", "eagle", "mammoth", "wolf"]) expect(open.has(id)).toBe(true);
    expect(open.has("shark")).toBe(false);
  });
});
