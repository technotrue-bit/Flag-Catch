import { describe, expect, it } from "vitest";
import { NO_INPUT, STEP, type Input, predict, step } from "../sim";
import { surfaceHeight } from "../terrain";
import { InputQueue, InputSender } from "./inputs";
import { type OnlineSetup, checkSetup, guestMatch, hostMatch, newSetup } from "./match";
import { applyMe, applySnap, encodeMe, encodeSnap, mapEvent } from "./snap";
import { makeView } from "./view";

const seats = [
  { team: 0 as const, slot: 0, animal: "lion", medic: false },
  { team: 1 as const, slot: 2, animal: "penguin", medic: false },
  { team: 0 as const, slot: 3, animal: "wolf", medic: true },
];

function setup(): OnlineSetup {
  return newSetup(77, "capture", "home", "medium", seats);
}

describe("each phone's side of an online match", () => {
  it("puts you in slot 0 of team 0 and keeps every player", () => {
    for (const me of [0, 3, 8, 10, 15]) {
      const v = makeView(me, 8, 1, [], []);
      expect(v.player(me)).toBe(0);
      const seen = new Set(Array.from({ length: 16 }, (_, h) => v.player(h)));
      expect(seen.size).toBe(16);
      for (let h = 0; h < 16; h++) expect(v.hostPlayer(v.player(h))).toBe(h);
      expect(v.team(Math.floor(me / 8) as 0 | 1)).toBe(0);
    }
  });

  it("builds the host's match with the real players in their seats, and CPUs everywhere else", () => {
    const s = setup();
    const m = hostMatch(s);
    expect(m.players.filter((p) => !p.cpu).map((p) => p.id).sort((a, b) => a - b)).toEqual([0, 3, 10]);
    expect(m.players[10].def.id).toBe("penguin");
    expect(m.players[3].medic).toBe(true);
    expect(m.skill[0]).toEqual(m.skill[1]);
    expect(s.animals).toHaveLength(16);
    expect(checkSetup(JSON.parse(JSON.stringify(s)))).not.toBeNull();
    expect(checkSetup({ ...s, perTeam: 64 })).toBeNull();
    expect(checkSetup({ ...s, seats: [{ ...seats[0], animal: "dragon" }] })).toBeNull();
  });

  it("shows a player on the host's team 1 the same match turned round, with their team as team 0", () => {
    const s = setup();
    const host = hostMatch(s);
    const others = (p: { id: number }): Input => (p.id === 10 ? { ...NO_INPUT, dirX: 0.3, dirZ: 1 } : NO_INPUT);
    for (let i = 0; i < 25 / STEP; i++) step(host, NO_INPUT, others);
    const { match: local, view } = guestMatch(JSON.parse(JSON.stringify(s)), 10);
    expect(view.flip).toBe(true);
    expect(local.players[0].def.id).toBe("penguin");
    expect(local.players[0].cpu).toBe(false);
    const text = JSON.stringify(encodeSnap(host));
    // Small enough to send 20 times a second to each phone.
    expect(text.length).toBeLessThan(2500);
    const snap = JSON.parse(text);
    applySnap(local, view, snap, snap, 1);
    for (let h = 0; h < host.players.length; h++) {
      const a = host.players[h];
      const b = local.players[view.player(h)];
      expect(b.def.id).toBe(a.def.id);
      expect(b.x).toBeCloseTo(-a.x, 1);
      expect(b.z).toBeCloseTo(-a.z, 1);
      expect(b.team).toBe(1 - a.team);
      // The ground is the same turned round, so every animal still stands on it.
      if (a.onSurface && a.medium === "land") expect(surfaceHeight(b.x, b.z)).toBeCloseTo(a.y, 0);
    }
    expect(local.scores).toEqual([host.scores[1], host.scores[0]]);
    for (let h = 0; h < host.flags.length; h++) {
      const a = host.flags[h];
      const b = local.flags[view.flag(h)];
      expect(b.owner).toBe(1 - a.owner);
      expect(b.team).toBe(1 - a.team);
      expect(b.state).toBe(a.state);
    }
    // Each station pairs with its mirror.
    host.stations.forEach((st, h) => {
      const l = local.stations[view.station(h)];
      expect(l.x).toBeCloseTo(-st.x, 3);
      expect(l.z).toBeCloseTo(-st.z, 3);
    });
    // The bases too: the host's team 1 base is this phone's own.
    expect(local.bases[view.base(1)].team).toBe(0);
    const e = mapEvent({ kind: "bank", x: 1, y: 2, z: 3, player: 10, team: 1 }, view);
    expect(e).toEqual({ kind: "bank", x: -1, y: 2, z: -3, player: 0, team: 0 });
    expect(mapEvent({ kind: "end", winner: 1 }, view)).toEqual({ kind: "end", winner: 0 });
  });

  it("a teammate of the host sees the island as it is, from their own seat", () => {
    const s = setup();
    const host = hostMatch(s);
    for (let i = 0; i < 5 / STEP; i++) step(host, NO_INPUT, () => NO_INPUT);
    const { match: local, view } = guestMatch(s, 3);
    expect(view.flip).toBe(false);
    const snap = encodeSnap(host);
    applySnap(local, view, snap, snap, 1);
    expect(local.players[0].x).toBeCloseTo(host.players[3].x, 1);
    expect(local.players[3].x).toBeCloseTo(host.players[0].x, 1);
    expect(local.players[0].medic).toBe(true);
  });

  it("moving your own animal ahead of the host lands where the host puts it", () => {
    const s = setup();
    const host = hostMatch(s);
    for (let i = 0; i < 2 / STEP; i++) step(host, NO_INPUT, () => NO_INPUT);
    const { match: local, view } = guestMatch(s, 10);
    applyMe(local, view, JSON.parse(JSON.stringify(encodeMe(host.players[10]))));
    // Your stick, in your frame; the host gets it turned round.
    const sender = new InputSender();
    const queue = new InputQueue(view.flip);
    for (let i = 0; i < 90; i++) {
      const input: Input = { ...NO_INPUT, dirX: Math.sin(i / 20), dirZ: Math.cos(i / 30), jump: i > 40 && i < 50 };
      sender.add(input);
      predict(local, local.players[0], input);
      queue.push(sender.frames());
      step(host, NO_INPUT, (p) => (p.id === 10 ? queue.next() : NO_INPUT));
    }
    const a = host.players[10];
    const b = local.players[0];
    expect(b.x).toBeCloseTo(-a.x, 3);
    expect(b.z).toBeCloseTo(-a.z, 3);
    expect(b.y).toBeCloseTo(a.y, 3);
    expect(queue.ack).toBe(90);
  });

  it("the host never loses or doubles a press, even when messages go missing", () => {
    const sender = new InputSender();
    const queue = new InputQueue(false);
    let throws = 0;
    for (let i = 0; i < 120; i++) {
      sender.add({ ...NO_INPUT, dirX: 1, throwPressed: i % 10 === 0 });
      // Only every third message gets through.
      if (i % 3 === 0) queue.push(sender.frames());
      if (queue.next().throwPressed) throws++;
    }
    queue.push(sender.frames());
    for (let i = 0; i < 10; i++) if (queue.next().throwPressed) throws++;
    expect(throws).toBe(12);
    // Junk is ignored.
    queue.push([["x"], null, [1, 2]]);
    expect(Number.isFinite(queue.next().dirX)).toBe(true);
  });
});

describe("names from the site", () => {
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function site() {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const sign = async (data: object) => {
      const body = b64(new TextEncoder().encode(JSON.stringify(data)));
      const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(body)));
      return `${body}.${b64(sig)}`;
    };
    return { jwk, sign };
  }

  it("shows a username only from a ticket the site signed, and not after it runs out", async () => {
    const { checkTicket } = await import("./ticket");
    const a = await site();
    const b = await site();
    const later = Date.now() + 3600_000;
    const good = await a.sign({ v: 1, h: "SkyRacer", u: "abc123", e: later });
    expect(await checkTicket(good, a.jwk)).toEqual({ name: "SkyRacer", uid: "abc123", exp: later });
    // Another key, a changed name, an old ticket or junk: nothing.
    expect(await checkTicket(good, b.jwk)).toBeNull();
    const [body, sig] = good.split(".");
    const forged = b64(new TextEncoder().encode(JSON.stringify({ v: 1, h: "Someone", u: "abc123", e: later })));
    expect(await checkTicket(`${forged}.${sig}`, a.jwk)).toBeNull();
    expect(await checkTicket(`${body}.${sig}`, a.jwk, later + 1)).toBeNull();
    expect(await checkTicket("nope", a.jwk)).toBeNull();
    expect(await checkTicket(42, a.jwk)).toBeNull();
    expect(await checkTicket(good, null)).toBeNull();
  });
});

describe("what the play page says about online play", () => {
  it("takes only the site's own Supabase address and a proper key", async () => {
    const { readOnline } = await import("../cloud");
    const key = { kty: "EC", crv: "P-256", x: "abc", y: "def" };
    const ok = { signedIn: true, ticket: "t.s", key, realtime: { url: "https://abcdefghijklmnop.supabase.co", key: "anon" } };
    expect(readOnline(ok, false)).toEqual({ signedIn: true, ticket: "t.s", siteKey: key, realtime: { url: "https://abcdefghijklmnop.supabase.co", key: "anon" } });
    expect(readOnline({ signedIn: false }, false)).toEqual({ signedIn: false });
    expect(readOnline({ ...ok, realtime: { url: "https://evil.example.com", key: "anon" } }, false)).toBeNull();
    expect(readOnline({ ...ok, realtime: { url: "http://localhost:5000", key: "anon" } }, false)).toBeNull();
    expect(readOnline({ ...ok, realtime: { url: "http://localhost:5000", key: "anon" } }, true)).not.toBeNull();
    expect(readOnline({ ...ok, key: { kty: "RSA" } }, false)).toBeNull();
  });
});
