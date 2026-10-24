import { describe, expect, it } from "vitest";
import { ANIMALS, ANIMAL_IDS } from "./animals";
import { type Difficulty, type Firecracker, HOARD_TARGET, type Input, type Match, NO_INPUT, SKILLS, STEP, createMatch, giveItem, rivalSkill, step, tune } from "./sim";
import { BRIDGES, MAPS, ZONE_EDGE, fromLayout, groundHeight, isWater, landOf, mapScale, setMap, surfaceHeight } from "./terrain";

const opts = { seed: 3, humanAnimal: "lion", perTeam: 4, duration: 60, flagsPerTeam: 5 };

/** Park everyone but the listed players so they can't move, throw or be hit. */
function freezeOthers(m: Match, keep: number[]): void {
  for (const p of m.players) if (!keep.includes(p.id)) p.stun = 999;
}

function enemyFire(m: Match, target: number, extra: Partial<Firecracker> = {}): Firecracker {
  const p = m.players[target];
  const owner = m.players.find((o) => o.team !== p.team)!;
  const f: Firecracker = {
    id: m.nextFireId++,
    owner: owner.id,
    team: owner.team,
    x: p.x,
    y: p.y + 0.7,
    z: p.z,
    vx: 1,
    vy: 0,
    vz: 0,
    skidding: false,
    life: 3,
    bomb: false,
    ...extra,
  };
  m.fires.push(f);
  return f;
}

function run(seed: number, seconds: number) {
  const m = createMatch({ ...opts, seed });
  const log: string[] = [];
  for (let i = 0; i < seconds / STEP; i++) {
    step(m, NO_INPUT);
    for (const e of m.events) if (e.kind !== "jump") log.push(e.kind);
  }
  return { m, log };
}

describe("match sim", () => {
  it("replays the same match from the same seed", () => {
    const a = run(11, 30);
    const b = run(11, 30);
    expect(a.log).toEqual(b.log);
    expect(a.m.players.map((p) => [p.x, p.z])).toEqual(b.m.players.map((p) => [p.x, p.z]));
  });

  it("CPU teams steal, pop and bank flags in a full match", () => {
    const { m, log } = run(2, 90);
    expect(log).toContain("grab");
    expect(log).toContain("throw");
    expect(log).toContain("bank");
    expect(m.over).toBe(true);
    expect(m.scores[0] + m.scores[1]).toBeGreaterThan(0);
  });

  it("each class is fastest in its own medium", () => {
    const { lion, penguin, eagle } = ANIMALS;
    expect(lion.landSpeed).toBeGreaterThan(penguin.landSpeed);
    expect(penguin.waterSpeed).toBeGreaterThan(lion.waterSpeed);
    expect(eagle.floatTime).toBeGreaterThan(lion.floatTime);
  });

  it("every map is three lands split by channels, with bridges across", () => {
    for (const map of MAPS) {
      setMap(map);
      const at = (u: number, v: number) => groundHeight(...fromLayout(u, v));
      expect(at(0, 0)).toBeGreaterThan(1);
      expect(at(0, 70)).toBeGreaterThan(1);
      expect(at(0, -70)).toBeGreaterThan(1);
      expect(isWater(...fromLayout(-24, 35))).toBe(true);
      expect(isWater(...fromLayout(24, -35))).toBe(true);
      expect(at(13, -6)).toBeLessThan(0);
      expect(at(48, 0)).toBeLessThan(0);
      // Every bridge stays dry from the middle land into the homeland.
      const s = mapScale();
      for (const x of BRIDGES) {
        for (let z = 20 * s; z <= 52 * s; z += 0.5) {
          expect(groundHeight(x, z)).toBeGreaterThan(0);
          expect(groundHeight(-x, -z)).toBeGreaterThan(0);
        }
      }
    }
    setMap(MAPS[0]);
  });

  it("bigger teams get bigger maps, gigantic from 32 a side", () => {
    expect(MAPS.map((m) => m.size)).toEqual([8, 16, 32, 64]);
    expect(MAPS.filter((m) => m.gigantic).map((m) => m.size)).toEqual([32, 64]);
    for (let i = 1; i < MAPS.length; i++) {
      expect(MAPS[i].scale * MAPS[i].wide).toBeGreaterThan(MAPS[i - 1].scale * MAPS[i - 1].wide);
      expect(MAPS[i].bridges.length).toBeGreaterThanOrEqual(MAPS[i - 1].bridges.length);
    }
    const m = createMatch({ ...opts, perTeam: 64, flagsPerTeam: MAPS[3].flagsPerTeam });
    expect(m.map.name).toBe(MAPS[3].name);
    expect(m.players).toHaveLength(128);
    // Everyone starts on dry land around their own base, not stacked up.
    for (const p of m.players) {
      expect(isWater(p.x, p.z)).toBe(false);
      expect(landOf(p.z)).toBe(p.team);
    }
    // Every flag starts inside its base pad and every station is on land.
    for (const f of m.flags) expect(Math.hypot(f.x - m.bases[f.base].x, f.z - m.bases[f.base].z)).toBeLessThan(m.baseRadius);
    // Gigantic maps give each team two outposts, and flags start spread across them.
    expect(m.bases.filter((b) => !b.main)).toHaveLength(4);
    for (const b of m.bases) {
      expect(landOf(b.z)).toBe(b.team);
      expect(m.flags.some((f) => f.base === b.id)).toBe(true);
    }
    for (const st of m.stations) expect(groundHeight(st.x, st.z)).toBeGreaterThan(0.5);
    setMap(MAPS[0]);
  });

  it("the map is the same for both teams", () => {
    for (let i = 0; i < 400; i++) {
      const x = ((i * 37) % 100) - 50;
      const z = ((i * 53) % 228) - 114;
      expect(groundHeight(x, z)).toBeCloseTo(groundHeight(-x, -z), 9);
    }
  });

  it("each team's flags start at home in its own base, and nobody scores early", () => {
    const m = createMatch(opts);
    expect(landOf(m.bases[0].z)).toBe(0);
    expect(landOf(m.bases[1].z)).toBe(1);
    for (const team of [0, 1] as const) {
      const mine = m.flags.filter((f) => f.team === team);
      expect(mine).toHaveLength(5);
      for (const f of mine) {
        expect(f.state).toBe("home");
        expect(Math.hypot(f.x - m.bases[team].x, f.z - m.bases[team].z)).toBeLessThan(m.baseRadius);
      }
    }
    m.players[0].cpu = true;
    for (let i = 0; i < 15 / STEP; i++) step(m, NO_INPUT);
    expect(m.scores).toEqual([0, 0]);
  });

  it("you can't pick up your own flag, only steal the enemy's", () => {
    const m = createMatch({ ...opts, perTeam: 1 });
    const [me, them] = m.players;
    them.cpu = false;
    const own = m.flags.find((f) => f.team === 0)!;
    me.x = own.x;
    me.z = own.z;
    step(m, NO_INPUT);
    expect(me.carrying).toBe(-1);
    const prize = m.flags.find((f) => f.team === 1)!;
    me.x = prize.x;
    me.z = prize.z;
    me.y = prize.y;
    step(m, NO_INPUT);
    expect(me.carrying).toBe(prize.id);
    // Bring it home: score, and the flag now sits in our base.
    me.x = m.bases[0].x;
    me.z = m.bases[0].z;
    step(m, NO_INPUT);
    expect(m.scores).toEqual([1, 0]);
    expect(prize.team).toBe(0);
    expect(prize.state).toBe("home");
  });

  it("owners save a dropped flag by touching it", () => {
    const m = createMatch({ ...opts, perTeam: 1 });
    const [me, them] = m.players;
    them.cpu = false;
    const ours = m.flags.find((f) => f.team === 0)!;
    ours.state = "dropped";
    ours.timer = 12;
    ours.x = me.x = 0;
    ours.z = me.z = 20;
    ours.y = me.y = groundHeight(0, 20);
    step(m, NO_INPUT);
    expect(ours.state).toBe("home");
    expect(Math.hypot(ours.x - m.bases[0].x, ours.z - m.bases[0].z)).toBeLessThan(m.baseRadius);
  });

  it("both teams capture flags over a full match", () => {
    let a = 0;
    let b = 0;
    for (const seed of [1, 2, 4, 9]) {
      const m = createMatch({ ...opts, seed, duration: 180 });
      m.players[0].cpu = true;
      for (let i = 0; i < 181 / STEP; i++) step(m, NO_INPUT);
      a += m.scores[0];
      b += m.scores[1];
    }
    expect(a).toBeGreaterThan(3);
    expect(b).toBeGreaterThan(3);
  });

  it("Hoard: flags in your base count points up, and the first to the target wins", () => {
    const m = createMatch({ ...opts, duration: 900, mode: "hoard" });
    m.players[0].cpu = true;
    for (let i = 0; i < 10 / STEP; i++) step(m, NO_INPUT);
    // Five flags each for ten seconds is about 50 points a side, still climbing.
    expect(m.scores[0]).toBeGreaterThan(40);
    expect(m.scores[1]).toBeGreaterThan(40);
    expect(m.over).toBe(false);
    while (!m.over) step(m, NO_INPUT);
    expect(Math.max(...m.scores)).toBe(HOARD_TARGET);
    expect(m.time).toBeLessThan(600);
  });

  it("the wolf is the fastest car and shoots harder and more often", () => {
    const { lion, wolf } = ANIMALS;
    expect(wolf.cls).toBe("land");
    expect(wolf.landSpeed).toBeGreaterThan(lion.landSpeed);
    const m = createMatch({ ...opts, humanAnimal: "wolf" });
    const p = m.players[0];
    step(m, { ...NO_INPUT, throwPressed: true });
    const f = m.fires[0];
    expect(Math.hypot(f.vx, f.vz)).toBeGreaterThan(tune.throwSpeed * 1.2);
    expect(p.throwCd).toBeLessThan(tune.throwCooldown);
  });

  it("a held stick drives the player forward on land", () => {
    const m = createMatch(opts);
    const p = m.players[0];
    const x0 = p.x;
    const z0 = p.z;
    for (let i = 0; i < 60; i++) step(m, { dirX: Math.sin(p.heading), dirZ: Math.cos(p.heading), jump: false, throwPressed: false });
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeGreaterThan(6);
  });

  it("swimmers dive under shots, but only while they have breath", () => {
    const m = createMatch({ ...opts, humanAnimal: "penguin" });
    const p = m.players[0];
    freezeOthers(m, [0]);
    let spot: [number, number] | null = null;
    for (let x = -40; x <= 40 && !spot; x += 2)
      for (let z = -30; z <= 30 && !spot; z += 2) if (groundHeight(x, z) < -1.5) spot = [x, z];
    expect(spot).not.toBeNull();
    [p.x, p.z] = spot!;
    p.y = 0;
    p.vy = 0;
    p.onSurface = true;
    const dive = { ...NO_INPUT, dive: true };
    step(m, dive);
    expect(p.diving).toBe(true);
    expect(p.y).toBeLessThan(surfaceHeight(p.x, p.z));
    enemyFire(m, 0, { y: p.y + 0.7 });
    for (let i = 0; i < 10; i++) step(m, dive);
    expect(p.stun).toBe(0);
    // Out of breath: forced up for a moment.
    for (let i = 0; i < (tune.diveBreath + 0.5) / STEP; i++) step(m, dive);
    expect(p.diving).toBe(false);
    expect(p.diveCd).toBeGreaterThan(0);
    // A land animal can't dive at all.
    const lion = createMatch(opts);
    freezeOthers(lion, [0]);
    const q = lion.players[0];
    [q.x, q.z] = spot!;
    q.y = 0;
    q.onSurface = true;
    step(lion, dive);
    expect(q.diving).toBe(false);
  });

  it("an eagle's bomb pops enemies around where it lands", () => {
    const m = createMatch({ ...opts, humanAnimal: "eagle" });
    const target = m.players.find((o) => o.team !== m.players[0].team)!;
    const bystander = m.players.find((o) => o.team !== m.players[0].team && o.id !== target.id)!;
    freezeOthers(m, [0, target.id, bystander.id]);
    target.cpu = false;
    bystander.cpu = false;
    bystander.x = target.x + 12;
    bystander.z = target.z;
    m.fires.push({
      id: m.nextFireId++,
      owner: 0,
      team: m.players[0].team,
      x: target.x + 1.5,
      y: target.y + 6,
      z: target.z,
      vx: 0,
      vy: -3,
      vz: 0,
      skidding: false,
      life: 5,
      bomb: true,
    });
    const kinds: string[] = [];
    for (let i = 0; i < 90; i++) {
      step(m, NO_INPUT);
      for (const e of m.events) kinds.push(e.kind);
    }
    expect(kinds).toContain("boom");
    expect(kinds.includes("hit") || kinds.includes("pop")).toBe(true);
    expect(bystander.stun).toBe(0);
  });

  it("the mammoth shrugs off a pop faster than the lion", () => {
    const stunAfterHit = (animal: string) => {
      const m = createMatch({ ...opts, humanAnimal: animal });
      freezeOthers(m, [0]);
      enemyFire(m, 0);
      step(m, NO_INPUT);
      return m.players[0].stun;
    };
    const lion = stunAfterHit("lion");
    const mammoth = stunAfterHit("mammoth");
    expect(lion).toBeGreaterThan(0);
    expect(mammoth).toBeGreaterThan(0);
    expect(mammoth).toBeLessThan(lion * 0.6);
  });

  it("the CPU uses dives, bombs and flight over a long match", () => {
    const m = createMatch({ ...opts, seed: 8, humanAnimal: "eagle", perTeam: 6, duration: 240 });
    m.players[0].cpu = true;
    const kinds = new Set<string>();
    while (!m.over) {
      step(m, NO_INPUT);
      for (const e of m.events) kinds.add(e.kind);
    }
    expect(kinds.has("dive")).toBe(true);
    expect(kinds.has("boom")).toBe(true);
  });
});

describe("power ups", () => {
  const USE: Input = { ...NO_INPUT, useItem: true };

  /** A quiet match: everyone but player 0 and the listed enemies is parked. */
  function setup(enemies = 1) {
    const m = createMatch({ ...opts, perTeam: 8 });
    const me = m.players[0];
    const foes = m.players.filter((o) => o.team !== me.team).slice(0, enemies);
    freezeOthers(m, [0, ...foes.map((f) => f.id)]);
    for (const f of foes) f.cpu = false;
    me.cpu = false;
    return { m, me, foes };
  }

  /** Put a player on dry ground at a spot. */
  function place(p: Match["players"][number], x: number, z: number) {
    p.x = x;
    p.z = z;
    p.y = surfaceHeight(x, z);
    p.vy = 0;
  }

  it("driving over a station hands out an item and the station recharges", () => {
    const { m, me } = setup(0);
    const st = m.stations[0];
    place(me, st.x, st.z);
    const kinds: string[] = [];
    for (let i = 0; i < 5; i++) {
      step(m, NO_INPUT);
      for (const e of m.events) kinds.push(e.kind);
    }
    expect(kinds).toContain("item");
    expect(me.item).not.toBeNull();
    expect(st.cd).toBeGreaterThan(0);
  });

  it("a shield blocks a hit while it lasts", () => {
    const { m, me } = setup(0);
    giveItem(me, "shield");
    step(m, USE);
    expect(me.shieldT).toBeGreaterThan(0);
    enemyFire(m, 0);
    const kinds: string[] = [];
    step(m, NO_INPUT);
    for (const e of m.events) kinds.push(e.kind);
    expect(kinds).toContain("block");
    expect(me.stun).toBe(0);
  });

  it("with a star you pop any enemy you bump into", () => {
    const { m, me, foes } = setup(1);
    const [foe] = foes;
    place(me, 0, 0);
    place(foe, 0.8, 0);
    giveItem(me, "star");
    step(m, USE);
    step(m, NO_INPUT);
    expect(foe.stun).toBeGreaterThan(0);
    expect(me.stun).toBe(0);
  });

  it("lightning pops enemies nearby but not far away", () => {
    const { m, me, foes } = setup(2);
    const [near, far] = foes;
    place(me, 0, 0);
    place(near, 8, 4);
    place(far, 0, tune.lightningRadius + 15);
    giveItem(me, "lightning");
    step(m, USE);
    expect(near.stun).toBeGreaterThan(0);
    expect(far.stun).toBe(0);
  });

  it("a missile homes in on an enemy off to the side", () => {
    const { m, me, foes } = setup(1);
    const [foe] = foes;
    place(me, 0, 0);
    place(foe, 12, -14);
    me.heading = Math.PI;
    giveItem(me, "missile");
    step(m, USE);
    expect(m.fires.some((f) => f.homing === foe.id)).toBe(true);
    for (let i = 0; i < 4 / STEP && foe.stun === 0; i++) step(m, NO_INPUT);
    expect(foe.stun).toBeGreaterThan(0);
  });

  it("turbo makes you faster for a while", () => {
    const ride = (turbo: boolean) => {
      const { m, me } = setup(0);
      place(me, 0, 10);
      if (turbo) {
        giveItem(me, "turbo");
        step(m, USE);
      }
      const z0 = me.z;
      for (let i = 0; i < 2 / STEP; i++) step(m, { ...NO_INPUT, dirX: 0, dirZ: -1 });
      return Math.abs(me.z - z0);
    };
    expect(ride(true)).toBeGreaterThan(ride(false) * 1.2);
  });
});

describe("health, knockouts and medics", () => {
  function quiet(extra: Partial<Parameters<typeof createMatch>[0]> = {}) {
    const m = createMatch({ ...opts, perTeam: 8, ...extra });
    freezeOthers(m, [0]);
    m.players[0].cpu = false;
    return m;
  }

  function hitAndSettle(m: Match, id: number) {
    enemyFire(m, id);
    const kinds: string[] = [];
    for (let i = 0; i < 40; i++) {
      step(m, NO_INPUT);
      for (const e of m.events) kinds.push(e.kind);
    }
    return kinds;
  }

  it("the first two hits only make you flinch; the third knocks you out and drops your flag", () => {
    const m = quiet();
    const me = m.players[0];
    me.x = 0;
    me.z = 0;
    me.y = surfaceHeight(0, 0);
    const flag = m.flags.find((f) => f.team === 1)!;
    flag.state = "carried";
    flag.carrier = 0;
    me.carrying = flag.id;
    expect(hitAndSettle(m, 0)).toContain("hit");
    expect(me.hp).toBe(2);
    expect(me.carrying).toBe(flag.id);
    hitAndSettle(m, 0);
    expect(me.hp).toBe(1);
    expect(me.carrying).toBe(flag.id);
    enemyFire(m, 0);
    step(m, NO_INPUT);
    expect(me.out).toBeGreaterThan(0);
    expect(me.carrying).toBe(-1);
    expect(flag.state).toBe("dropped");
  });

  it("a knocked out animal is back at home after 2 seconds with full health", () => {
    const m = quiet();
    const me = m.players[0];
    me.x = 0;
    me.z = 0;
    me.y = surfaceHeight(0, 0);
    me.hp = 1;
    me.healCd = 10;
    enemyFire(m, 0);
    step(m, NO_INPUT);
    expect(me.out).toBeGreaterThan(0);
    for (let i = 0; i < 1.9 / STEP; i++) step(m, NO_INPUT);
    expect(me.out).toBeGreaterThan(0);
    const kinds: string[] = [];
    for (let i = 0; i < 0.2 / STEP; i++) {
      step(m, NO_INPUT);
      for (const e of m.events) kinds.push(e.kind);
    }
    expect(kinds).toContain("respawn");
    expect(me.out).toBe(0);
    expect(me.hp).toBe(tune.maxHits);
    const home = m.bases[0];
    expect(Math.hypot(me.x - home.x, me.z - home.z)).toBeLessThan(m.baseRadius + 3);
  });

  it("a hurt animal heals a hit back after a while without being hit", () => {
    const m = quiet();
    const me = m.players[0];
    hitAndSettle(m, 0);
    expect(me.hp).toBe(2);
    for (let i = 0; i < tune.healTime / STEP; i++) step(m, NO_INPUT);
    expect(me.hp).toBe(3);
  });

  it("a medic plants a respawn flag at most every 30 seconds, and teammates come back there", () => {
    const m = quiet({ humanMedic: true });
    const me = m.players[0];
    const [x, z] = [0, 0];
    me.x = x;
    me.z = z;
    me.y = surfaceHeight(x, z);
    step(m, { ...NO_INPUT, plant: true });
    expect(m.respawns.length).toBe(1);
    step(m, { ...NO_INPUT, plant: true });
    expect(m.respawns.length).toBe(1);
    expect(me.medicCd).toBeGreaterThan(tune.medicCooldown - 1);
    for (let i = 0; i < tune.medicCooldown / STEP; i++) step(m, NO_INPUT);
    expect(me.medicCd).toBe(0);
    // A teammate knocked out near the flag comes back beside it, not at home.
    const mate = m.players.find((p) => p.team === 0 && p.id !== 0)!;
    mate.stun = 0;
    mate.x = 6;
    mate.z = -4;
    mate.y = surfaceHeight(6, -4);
    mate.hp = 1;
    mate.healCd = 10;
    enemyFire(m, mate.id);
    step(m, NO_INPUT);
    expect(mate.out).toBeGreaterThan(0);
    for (let i = 0; i < (tune.outTime + 0.1) / STEP; i++) step(m, NO_INPUT);
    expect(mate.out).toBe(0);
    expect(Math.hypot(mate.x - x, mate.z - z)).toBeLessThan(4);
  });

  it("an enemy knocks a respawn flag down by driving into it", () => {
    const m = quiet({ humanMedic: true });
    const me = m.players[0];
    me.x = 0;
    me.z = 0;
    me.y = surfaceHeight(0, 0);
    step(m, { ...NO_INPUT, plant: true });
    expect(m.respawns.length).toBe(1);
    me.x = 20;
    const foe = m.players.find((p) => p.team === 1)!;
    foe.stun = 0;
    foe.cpu = false;
    foe.x = 0.5;
    foe.z = 0;
    foe.y = surfaceHeight(0.5, 0);
    step(m, NO_INPUT);
    expect(m.respawns.length).toBe(0);
  });

  it("flyers keep flying while Jump is held, and glide down once it's let go", () => {
    const m = quiet({ humanAnimal: "eagle" });
    const me = m.players[0];
    for (let i = 0; i < 6 / STEP; i++) step(m, { ...NO_INPUT, jump: true });
    expect(me.onSurface).toBe(false);
    expect(me.y - surfaceHeight(me.x, me.z)).toBeGreaterThan(tune.flyCeiling - 2);
    for (let i = 0; i < 8 / STEP && !me.onSurface; i++) step(m, NO_INPUT);
    expect(me.onSurface).toBe(true);
  });
});

describe("CPU brains and difficulty", () => {
  it("harder rivals win more against the same teammates", () => {
    const margin = (difficulty: Difficulty) => {
      let total = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const m = createMatch({ ...opts, seed, perTeam: 8, duration: 120, difficulty });
        m.players[0].cpu = true;
        while (!m.over) step(m, NO_INPUT);
        total += m.scores[0] - m.scores[1];
      }
      return total;
    };
    const easy = margin("easy");
    const hard = margin("hard");
    expect(easy).toBeGreaterThan(0);
    expect(easy).toBeGreaterThan(hard + 4);
  });

  it("hard CPUs dodge more of the shots they see coming than easy ones", () => {
    const dodged = (difficulty: Difficulty) => {
      let safe = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const m = createMatch({ ...opts, seed, perTeam: 8, difficulty });
        const target = m.players.find((p) => p.team === 1)!;
        freezeOthers(m, [target.id]);
        target.x = 0;
        target.z = 0;
        target.y = surfaceHeight(0, 0);
        target.thinkCd = 99;
        target.goalX = 0;
        target.goalZ = -10;
        // A skidding shot coming straight at it from 6 m away.
        enemyFire(m, target.id, { x: 0, z: 6, y: target.y + 0.3, vx: 0, vz: -14, vy: 0, skidding: true });
        for (let i = 0; i < 40; i++) step(m, NO_INPUT);
        if (target.hp === tune.maxHits) safe++;
      }
      return safe;
    };
    expect(dodged("hard")).toBeGreaterThan(dodged("easy") + 5);
  });

  it("a CPU down to its last hit backs off when an enemy is close", () => {
    const m = createMatch({ ...opts, perTeam: 8 });
    const p = m.players.find((o) => o.team === 1 && o.role === "attack")!;
    const foe = m.players[0];
    freezeOthers(m, [p.id, 0]);
    foe.cpu = false;
    p.x = 0;
    p.z = 0;
    p.y = surfaceHeight(0, 0);
    foe.x = 5;
    foe.z = 0;
    foe.y = surfaceHeight(5, 0);
    p.hp = 1;
    p.healCd = 99;
    p.thinkCd = 0;
    step(m, NO_INPUT);
    expect(p.goalTag).toBe("retreat");
  });

  it("bigger teams keep each difficulty closer to Medium", () => {
    expect(rivalSkill("hard", 8)).toEqual(SKILLS.hard);
    const big = rivalSkill("hard", 64);
    expect(big.dodge).toBeLessThan(SKILLS.hard.dodge);
    expect(big.dodge).toBeGreaterThan(SKILLS.medium.dodge);
    expect(rivalSkill("medium", 64)).toEqual(SKILLS.medium);
  });
});

describe("team plans and specialties", () => {
  /** A full 8v8 Capture match, one big flag a side, all CPUs. */
  function capture(seed: number, extra: Partial<Parameters<typeof createMatch>[0]> = {}) {
    const m = createMatch({ seed, humanAnimal: "lion", perTeam: 8, duration: 180, flagsPerTeam: 1, mode: "capture", ...extra });
    m.players[0].cpu = true;
    return m;
  }

  it("no CPU stands still for long", () => {
    for (const seed of [1, 2, 3]) {
      const m = capture(seed);
      const still = new Map<number, number>();
      let worst = 0;
      while (!m.over) {
        step(m, NO_INPUT);
        for (const p of m.players) {
          const idle = p.out <= 0 && p.stun <= 0 && Math.abs(p.speed) < 0.6;
          const t = idle ? (still.get(p.id) ?? 0) + STEP : 0;
          still.set(p.id, t);
          worst = Math.max(worst, t);
        }
      }
      expect(worst).toBeLessThan(4);
    }
  }, 20000);

  it("each animal leans to the job its style is made for", () => {
    const time: Record<string, Record<string, number>> = {};
    for (const seed of [1, 2, 3, 4]) {
      const m = capture(seed);
      while (!m.over) {
        step(m, NO_INPUT);
        for (const p of m.players) {
          const row = (time[p.def.style] ??= {});
          row[p.job] = (row[p.job] ?? 0) + STEP;
        }
      }
    }
    const share = (style: string, job: string) => {
      const row = time[style] ?? {};
      const total = Object.values(row).reduce((a, b) => a + b, 0) || 1;
      return (row[job] ?? 0) / total;
    };
    expect(share("raider", "raid")).toBeGreaterThan(share("guardian", "raid") + 0.2);
    expect(share("guardian", "guard")).toBeGreaterThan(share("raider", "guard") + 0.15);
    expect(share("hunter", "hunt")).toBeGreaterThan(share("raider", "hunt") + 0.1);
  }, 20000);

  it("every style has an animal, and every animal a style", () => {
    const styles = new Set(ANIMAL_IDS.map((id) => ANIMALS[id].style));
    expect([...styles].sort()).toEqual(["allrounder", "bomber", "guardian", "hunter", "raider"]);
  });

  it("a hunter cuts a thief off ahead instead of trailing behind", () => {
    const m = capture(4);
    const thief = m.players.find((p) => p.team === 1)!;
    const hunter = m.players.find((p) => p.team === 0 && p.id !== 0)!;
    freezeOthers(m, [thief.id, hunter.id]);
    // The thief runs north for home with our flag; the hunter waits off to the side, further north.
    thief.x = 0;
    thief.z = 10;
    thief.y = surfaceHeight(0, 10);
    thief.heading = Math.PI;
    thief.carrying = m.flags.find((f) => f.owner === 0)!.id;
    m.flags[thief.carrying].state = "carried";
    m.flags[thief.carrying].carrier = thief.id;
    hunter.x = 20;
    hunter.z = -20;
    hunter.y = surfaceHeight(20, -20);
    m.planCd = [0, 0];
    hunter.thinkCd = 0;
    step(m, NO_INPUT);
    expect(hunter.job).toBe("hunt");
    // Its goal is between the thief and the thief's base, not behind the thief.
    expect(hunter.goalZ).toBeLessThan(thief.z - 5);
  });

  it("guards keep walking their patrol while nothing happens", () => {
    const m = capture(1);
    for (let i = 0; i < 5 / STEP; i++) step(m, NO_INPUT);
    const guards = m.players.filter((p) => p.job === "guard");
    expect(guards.length).toBeGreaterThan(0);
    for (const g of guards) {
      const x = g.x;
      const z = g.z;
      for (let i = 0; i < 2 / STEP; i++) step(m, NO_INPUT);
      if (g.job === "guard" && g.goalTag === "guard") expect(Math.hypot(g.x - x, g.z - z)).toBeGreaterThan(2);
    }
  });

  it("a tie at the buzzer goes to overtime, and the next capture wins it", () => {
    const m = capture(1, { duration: 1 });
    freezeOthers(m, []);
    const events: string[] = [];
    for (let i = 0; i < 1.1 / STEP; i++) {
      step(m, NO_INPUT);
      for (const e of m.events) events.push(e.kind);
    }
    expect(events).toContain("overtime");
    expect(m.overtime).toBe(true);
    expect(m.over).toBe(false);
    // A blue animal walks the red flag home.
    const p = m.players[1];
    p.stun = 0;
    p.cpu = false;
    const flag = m.flags.find((f) => f.owner === 1)!;
    flag.state = "carried";
    flag.carrier = p.id;
    p.carrying = flag.id;
    p.x = m.bases[0].x;
    p.z = m.bases[0].z;
    step(m, NO_INPUT);
    expect(m.scores).toEqual([1, 0]);
    expect(m.over).toBe(true);
  });

  it("Capture matches almost always end with a winner", () => {
    let draws = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const m = capture(seed);
      while (!m.over) step(m, NO_INPUT);
      if (m.scores[0] === m.scores[1]) draws++;
    }
    expect(draws).toBeLessThanOrEqual(2);
  }, 20000);

  it("both sides win about as often when the teams are the same", () => {
    let a = 0;
    let b = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const m = capture(seed, { world: ["home", "reef", "bluffs", "frost", "lagoon", "storm", "dunes", "lava"][seed % 8] });
      while (!m.over) step(m, NO_INPUT);
      if (m.scores[0] > m.scores[1]) a++;
      if (m.scores[1] > m.scores[0]) b++;
    }
    expect(Math.abs(a - b)).toBeLessThanOrEqual(6);
  }, 30000);
});
