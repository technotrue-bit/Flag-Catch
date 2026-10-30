/**
 * Phones in a room, end to end, in one process: rooms meet over the BroadcastChannel stand-in for the site's
 * Realtime, and (Node having no WebRTC) every link takes the fallback path through it, as it does on networks
 * that block direct links. A real match then runs between them: the host steps it with everyone's input, the
 * others draw it from their side and move themselves ahead of it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NO_INPUT, STEP, type Input, type SimEvent, predict, step } from "../sim";
import { EventQueue, SnapBuffer } from "./client";
import { InputSender } from "./inputs";
import { type OnlineSetup, guestMatch, hostMatch, newSetup } from "./match";
import { GuestRoom, HostRoom, type RoomEnv, type RoomEvents, type RoomState, cleanCode, newCode } from "./room";
import { localSignal } from "./signal";
import { type Snap, applyMe, applySnap, encodeMe, encodeSnap } from "./snap";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (ok: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out");
    await wait(20);
  }
};

const closers: Array<() => void> = [];
afterEach(() => {
  while (closers.length) closers.pop()!();
});

function env(name: string): RoomEnv {
  const signal = localSignal();
  closers.push(() => signal.close());
  return {
    signal,
    me: { id: `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`, ticket: `local:${name}`, who: { name, uid: name, exp: Infinity } },
    check: async (t) => (typeof t === "string" && t.startsWith("local:") && t !== "local:Faker" ? { name: t.slice(6), uid: t.slice(6), exp: Infinity } : null),
    local: true,
  };
}

interface Phone {
  states: RoomState[];
  starts: Array<{ setup: OnlineSetup; me: number }>;
  snaps: Snap[];
  events: Array<{ t: number; list: SimEvent[] }>;
  left: number[];
  closed: string[];
  on: RoomEvents;
}
function phone(): Phone {
  const p: Phone = { states: [], starts: [], snaps: [], events: [], left: [], closed: [], on: null as unknown as RoomEvents };
  p.on = {
    change: (s) => p.states.push(s),
    start: (setup, me) => p.starts.push({ setup, me }),
    snap: (s) => p.snaps.push(s),
    events: (t, list) => p.events.push({ t, list }),
    left: (seat) => p.left.push(seat),
    closed: (why) => p.closed.push(why),
  };
  return p;
}
const rules = { world: "home", mode: "capture" as const, difficulty: "medium" as const };

describe("online rooms", () => {
  it("room codes have no vowels or look-alikes, and typed codes are tidied", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[BCDFGHJKMNPQRTVWXZ2346789]{4}$/);
    expect(cleanCode(" bk-q7 ")).toBe("BKQ7");
    expect(cleanCode("BKA7")).toBeNull();
    expect(cleanCode("BK7")).toBeNull();
  });

  it("friends join with the code, land on both teams, and play a whole match from their own side", async () => {
    const h = phone();
    const host = new HostRoom(env("Ana"), { animal: "lion", medic: false }, rules, false, h.on);
    closers.push(() => host.leave());
    await host.begin();

    const b = phone();
    const bea = new GuestRoom(env("Bea"), { animal: "penguin", medic: false }, host.code, b.on);
    closers.push(() => bea.leave());
    await bea.begin();
    const c = phone();
    const cal = new GuestRoom(env("Cal"), { animal: "wolf", medic: true }, host.code, c.on);
    closers.push(() => cal.leave());
    await cal.begin();
    expect(bea.relayed).toBe(true);

    await until(() => host.state().members.length === 3);
    await until(() => (b.states.at(-1)?.members.length ?? 0) === 3 && (c.states.at(-1)?.members.length ?? 0) === 3);
    const members = host.state().members;
    expect(members.map((m) => [m.name, m.team])).toEqual([
      ["Ana", 0],
      ["Bea", 1],
      ["Cal", 0],
    ]);
    // Each phone sees the names (from checked tickets) and which one is them.
    expect(b.states.at(-1)!.members.find((m) => m.you)?.name).toBe("Bea");
    expect(c.states.at(-1)!.members.find((m) => m.host)?.name).toBe("Ana");

    bea.pick({ animal: "shark", medic: false });
    await until(() => host.state().members.find((m) => m.name === "Bea")?.animal === "shark");

    // A ticket that doesn't check out is turned away.
    const f = phone();
    const fake = new GuestRoom({ ...env("Faker") }, { animal: "lion", medic: false }, host.code, f.on);
    await expect(fake.begin()).rejects.toThrow("ticket");

    const setup = newSetup(5, "capture", "home", "medium", host.seats());
    const m = hostMatch(setup);
    host.start(setup);
    await until(() => b.starts.length === 1 && c.starts.length === 1);
    const bs = guestMatch(b.starts[0].setup, b.starts[0].me);
    const cs = guestMatch(c.starts[0].setup, c.starts[0].me);
    expect(bs.view.flip).toBe(true);
    expect(bs.match.players[0].def.id).toBe("shark");
    expect(cs.match.players[0].medic).toBe(true);

    // Bea's phone: her stick goes to the host; she moves ahead of its word and corrects to it.
    const sender = new InputSender();
    const pending: Array<{ seq: number; input: Input }> = [];
    const buf = new SnapBuffer();
    const queue = new EventQueue();
    let acked = 0;
    let used = 0;
    const beaSeat = b.starts[0].me;
    let steps = 0;
    const start = Date.now();
    while (Date.now() - start < 4000) {
      // Host: everyone's input, one step, a snapshot every third.
      const inputs = new Map<number, Input>();
      for (const s of [beaSeat, c.starts[0].me]) {
        const input = host.input(s);
        m.players[s].cpu = !input;
        if (input) inputs.set(s, input);
      }
      step(m, NO_INPUT, (p) => inputs.get(p.id) ?? NO_INPUT);
      const ev = [...m.events];
      steps++;
      if (steps % 3 === 0) {
        host.send(encodeSnap(m), (seat) => encodeMe(m.players[seat]), steps / 3);
        host.sendEvents(m.time, ev);
      }
      // Bea: steer in a circle, stopping for the last second.
      const me = bs.match.players[0];
      const input: Input = Date.now() - start < 3000 ? { ...NO_INPUT, dirX: Math.sin(steps / 40), dirZ: Math.cos(steps / 40) } : NO_INPUT;
      pending.push({ seq: sender.add(input), input });
      predict(bs.match, me, input);
      if (steps % 6 === 0) bea.sendInput(sender.frames());
      for (; used < b.snaps.length; used++) {
        const s = b.snaps[used];
        buf.push(s, Date.now() / 1000);
        if (s.me && typeof s.a === "number" && s.a >= acked) {
          acked = s.a;
          applyMe(bs.match, bs.view, s.me);
          const left = pending.filter((q) => q.seq > acked);
          pending.length = 0;
          pending.push(...left);
          for (const q of pending) predict(bs.match, me, q.input);
        }
      }
      for (const e of b.events.splice(0)) queue.push(e.t, e.list);
      await wait(STEP * 1000);
    }
    // Everyone stopped: let the last inputs and snapshots arrive.
    await wait(800);
    for (; used < b.snaps.length; used++) {
      const s = b.snaps[used];
      buf.push(s, Date.now() / 1000);
    }
    for (let i = 0; i < 30; i++) {
      const inputs = new Map<number, Input>();
      for (const s of [beaSeat]) {
        const input = host.input(s);
        if (input) inputs.set(s, input);
      }
      step(m, NO_INPUT, (p) => inputs.get(p.id) ?? NO_INPUT);
    }
    expect(b.snaps.length).toBeGreaterThan(20);
    expect(c.snaps.length).toBeGreaterThan(20);
    // The host moved Bea the way her phone did.
    const hb = m.players[beaSeat];
    const travelled = Math.hypot(hb.x - setupStart(setup, beaSeat).x, hb.z - setupStart(setup, beaSeat).z);
    expect(travelled).toBeGreaterThan(5);
    expect(Math.abs(-hb.x - bs.match.players[0].x)).toBeLessThan(1.5);
    expect(Math.abs(-hb.z - bs.match.players[0].z)).toBeLessThan(1.5);
    // Cal's phone draws the host where the host is (a moment ago).
    const last = c.snaps.at(-1)!;
    applySnap(cs.match, cs.view, last, last, 1, 0);
    expect(cs.match.players[cs.view.player(0)].x).toBeCloseTo(m.players[0].x, 0);
    expect(buf.newest()?.t ?? 0).toBeGreaterThan(1);

    // Cal leaves mid match: the host hears which seat a CPU takes over.
    cal.leave();
    await until(() => h.left.length === 1);
    expect(h.left[0]).toBe(c.starts[0].me);
    await until(() => host.input(c.starts[0].me) === null);

    // The host leaves: Bea's room closes.
    host.leave();
    await until(() => b.closed.length === 1, 20000);
    expect(b.closed[0]).toBe("host");
  }, 40000);

  it("quick match finds an open room, and an open room starts by itself once a second player is in", async () => {
    const { findRooms, AUTO_START_S } = await import("./room");
    const h = phone();
    const host = new HostRoom(env("Eve"), { animal: "lion", medic: false }, rules, true, h.on);
    closers.push(() => host.leave());
    await host.begin();
    // A room made with a code isn't listed.
    const secret = new HostRoom(env("Gus"), { animal: "lion", medic: false }, rules, false, phone().on);
    closers.push(() => secret.leave());
    await secret.begin();
    const e = env("Fin");
    const found = await findRooms(e.signal, 3500);
    expect(found).toEqual([host.code]);
    const g = new GuestRoom(e, { animal: "frog", medic: false }, found[0], phone().on);
    closers.push(() => g.leave());
    await g.begin();
    await until(() => host.state().members.length === 2);
    const auto = host.state().autoIn ?? 0;
    expect(auto).toBeGreaterThan(AUTO_START_S - 3);
    expect(host.due()).toBe(false);
  }, 20000);

  it("a code nobody is using says so", async () => {
    const g = new GuestRoom(env("Dee"), { animal: "lion", medic: false }, "BBBB", phone().on);
    await expect(g.begin()).rejects.toThrow("none");
  }, 12000);
});

function setupStart(setup: OnlineSetup, seat: number) {
  const fresh = hostMatch({ ...setup });
  return fresh.players[seat];
}
