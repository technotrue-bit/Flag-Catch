/**
 * Online rooms. One phone makes a room (it is the host and runs the match); others join with its code, or Quick
 * Match finds an open room. Everyone in a room is a signed-in TrueAIGaming.com player, shown only by the username
 * on their ticket (ticket.ts). There is no chat: the only things a player sends are their animal, their role and,
 * in a match, their stick and buttons.
 */
import { ANIMALS } from "../animals";
import type { Snap } from "./snap";
import type { InputFrame } from "./inputs";
import { InputQueue } from "./inputs";
import { type OnlineSetup, ONLINE_MAX, ONLINE_PER_TEAM, type Seat, checkSetup } from "./match";
import { type Link, openLink } from "./peer";
import type { Signal, Topic } from "./signal";
import type { Who } from "./ticket";
import type { Difficulty, Mode, SimEvent, Team } from "../sim";
import { WORLDS } from "../worlds";

/** Room codes: no vowels (so no words), no look-alikes (0 O 1 I L 5 S). */
const CODE_CHARS = "BCDFGHJKMNPQRTVWXZ2346789";
export const CODE_LENGTH = 4;
const LOBBY = "fc:lobby";
/** An open quick match room starts this long after its second player joins (sooner when full). */
export const AUTO_START_S = 20;

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

/** A typed code, tidied: upper case, only code letters, or null when it can't be one. */
export function cleanCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_CHARS.includes(ch)) ? c : null;
}

export function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("");
}

export interface Member {
  id: string;
  name: string;
  animal: string;
  medic: boolean;
  team: Team;
  slot: number;
  host: boolean;
  you: boolean;
}

/** What the host picked for the next match, shown to everyone in the room. */
export interface Rules {
  world: string;
  mode: Mode;
  difficulty: Difficulty;
}

export interface RoomState {
  code: string;
  rules: Rules;
  host: boolean;
  /** Quick match rooms are listed for others to find; rooms made with a code are not. */
  open: boolean;
  members: Member[];
  /** Seconds until a quick match room starts by itself, or null. */
  autoIn: number | null;
  playing: boolean;
  /** Set when someone's link goes through the fallback, which is slower. */
  slow: boolean;
}

export interface Identity {
  id: string;
  ticket: string;
  who: Who;
}

export interface RoomEnv {
  signal: Signal;
  me: Identity;
  /** Checks someone else's ticket. */
  check(ticket: unknown): Promise<Who | null>;
  local: boolean;
}

export interface Picks {
  animal: string;
  medic: boolean;
}

export interface RoomEvents {
  change(state: RoomState): void;
  /** The match starts: its setup, your seat (host player id) and the seat of every member by id. */
  start(setup: OnlineSetup, me: number): void;
  snap(s: Snap): void;
  events(t: number, list: SimEvent[]): void;
  /** A player left mid match (host player id); a CPU takes over. */
  left(seat: number): void;
  /** The room is gone: the host left, or you couldn't get in. */
  closed(why: string): void;
}

interface Guest {
  id: string;
  who: Who;
  ticket: string;
  animal: string;
  medic: boolean;
  team: Team;
  slot: number;
  link: Link;
  queue: InputQueue | null;
  seat: number;
  /** When its last input arrived (ms), to let a CPU drive while it's away. */
  heard: number;
}

const pickOk = (p: unknown): Picks | null => {
  const o = p as Partial<Picks> | null;
  return o && typeof o.animal === "string" && ANIMALS[o.animal] ? { animal: o.animal, medic: !!o.medic } : null;
};

/** The host's side of a room. */
export class HostRoom {
  readonly code: string;
  private topic: Topic | null = null;
  private lobby: Topic | null = null;
  private guests = new Map<string, Guest>();
  private pending = new Map<string, ReturnType<typeof openLink>>();
  private playing = false;
  private autoAt: number | null = null;
  private beacon: ReturnType<typeof setInterval> | undefined;
  private gone = false;

  constructor(
    private env: RoomEnv,
    private picks: Picks,
    private rules: Rules,
    readonly open: boolean,
    private on: RoomEvents,
    code = newCode(),
  ) {
    this.code = code;
  }

  async begin(): Promise<void> {
    const t = await this.env.signal.join(`fc:room:${this.code}`);
    this.topic = t;
    t.on((event, p) => void this.heard(event, p));
    if (this.open) {
      this.lobby = await this.env.signal.join(LOBBY);
      this.beacon = setInterval(() => this.announce(), 3000);
      this.announce();
    }
    this.changed();
  }

  private announce(): void {
    if (!this.lobby || this.playing || this.count() >= ONLINE_MAX) return;
    this.lobby.send("room", { code: this.code, n: this.count(), max: ONLINE_MAX, v: 1 });
  }

  private count(): number {
    return 1 + this.guests.size;
  }

  private async heard(event: string, p: Record<string, unknown>): Promise<void> {
    if (this.gone) return;
    if (event === "hello" && typeof p.from === "string" && p.to === this.code) {
      const from = p.from;
      if (this.guests.has(from) || this.pending.has(from)) return;
      const picks = pickOk(p.picks);
      const who = await this.env.check(p.ticket);
      const why = !who ? "ticket" : this.playing ? "playing" : this.count() >= ONLINE_MAX ? "full" : !picks ? "picks" : null;
      if (why || !who || !picks || this.gone) {
        this.topic?.send("nope", { to: from, why: why ?? "closed" });
        return;
      }
      const link = openLink({ signal: this.env.signal, room: this.topic!, roomName: `fc:room:${this.code}`, me: this.env.me.id, other: from, offer: false, local: this.env.local });
      this.pending.set(from, link);
      this.topic?.send("ok", { to: from, host: this.env.me.id });
      link.ready
        .then((l) => this.welcome(from, who, String(p.ticket), picks, l))
        .catch(() => this.pending.delete(from));
      return;
    }
    // Link set up messages go to the link they are for.
    if (typeof p.from === "string" && p.to === this.env.me.id) this.pending.get(p.from)?.signalIn(event, p);
  }

  private welcome(id: string, who: Who, ticket: string, picks: Picks, link: Link): void {
    this.pending.delete(id);
    if (this.gone || this.playing || this.count() >= ONLINE_MAX) {
      link.close();
      return;
    }
    const team = this.teamForNext();
    const g: Guest = { id, who, ticket, animal: picks.animal, medic: picks.medic, team, slot: this.freeSlot(team), link, queue: null, seat: -1, heard: 0 };
    this.guests.set(id, g);
    link.onMessage((msg, fast) => this.fromGuest(g, msg, fast));
    link.onClose(() => this.drop(g));
    if (this.open && this.count() >= 2 && this.autoAt === null) this.autoAt = Date.now() + AUTO_START_S * 1000;
    if (this.open && this.count() >= ONLINE_MAX) this.autoAt = Date.now() + 3000;
    this.changed();
  }

  private teamForNext(): Team {
    let a = 1;
    let b = 0;
    for (const g of this.guests.values()) g.team === 0 ? a++ : b++;
    return b < a ? 1 : 0;
  }

  private freeSlot(team: Team): number {
    const used = new Set([...this.guests.values()].filter((g) => g.team === team).map((g) => g.slot));
    if (team === 0) used.add(0);
    let s = 0;
    while (used.has(s)) s++;
    return s;
  }

  private fromGuest(g: Guest, msg: Record<string, unknown>, fast: boolean): void {
    if (fast) {
      if (msg.t === "in" && Array.isArray(msg.f) && g.queue) {
        g.queue.push(msg.f.slice(0, 16) as InputFrame[]);
        g.heard = Date.now();
      }
      return;
    }
    if (msg.t === "pick" && !this.playing) {
      const p = pickOk(msg);
      if (p) {
        g.animal = p.animal;
        g.medic = p.medic;
        this.changed();
      }
    } else if (msg.t === "bye") this.drop(g);
  }

  private drop(g: Guest): void {
    if (!this.guests.delete(g.id)) return;
    g.link.close();
    if (this.playing && g.seat >= 0) this.on.left(g.seat);
    if (this.count() < 2) this.autoAt = null;
    this.changed();
  }

  /** Change your own animal or role while waiting. */
  pick(p: Picks): void {
    this.picks = p;
    this.changed();
  }

  /** Change the world, mode or CPU skill for the next match. */
  setRules(r: Rules): void {
    this.rules = r;
    this.changed();
  }

  members(): Member[] {
    const me: Member = { id: this.env.me.id, name: this.env.me.who.name, animal: this.picks.animal, medic: this.picks.medic, team: 0, slot: 0, host: true, you: true };
    return [me, ...[...this.guests.values()].map((g) => ({ id: g.id, name: g.who.name, animal: g.animal, medic: g.medic, team: g.team, slot: g.slot, host: false, you: false }))];
  }

  state(): RoomState {
    return {
      code: this.code,
      rules: { ...this.rules },
      host: true,
      open: this.open,
      members: this.members(),
      autoIn: this.autoAt === null || this.playing ? null : Math.max(0, Math.ceil((this.autoAt - Date.now()) / 1000)),
      playing: this.playing,
      slow: [...this.guests.values()].some((g) => g.link.relayed),
    };
  }

  /** True when a quick match room's wait is over. */
  due(): boolean {
    return this.autoAt !== null && !this.playing && Date.now() >= this.autoAt;
  }

  private changed(): void {
    if (this.gone) return;
    const st = this.state();
    this.on.change(st);
    // Everyone else gets the same list, with tickets so each phone checks each name itself.
    const tickets: Record<string, string> = { [this.env.me.id]: this.env.me.ticket };
    for (const g of this.guests.values()) tickets[g.id] = g.ticket;
    for (const g of this.guests.values()) {
      g.link.safe({ t: "room", code: this.code, rules: this.rules, open: this.open, autoIn: st.autoIn, playing: this.playing, slow: st.slow, members: st.members.map((m) => ({ ...m, name: undefined, you: undefined, ticket: tickets[m.id] })) });
    }
  }

  /** The seats for a match: you, then everyone in the room. */
  seats(): Seat[] {
    return [
      { team: 0, slot: 0, animal: this.picks.animal, medic: this.picks.medic },
      ...[...this.guests.values()].map((g) => ({ team: g.team, slot: g.slot, animal: g.animal, medic: g.medic })),
    ];
  }

  /** Starts a match with this setup (made from seats()); everyone else gets it too. */
  start(setup: OnlineSetup): void {
    this.playing = true;
    this.autoAt = null;
    for (const g of this.guests.values()) {
      g.seat = g.team * ONLINE_PER_TEAM + g.slot;
      g.queue = new InputQueue(g.team === 1);
      g.heard = Date.now();
      g.link.safe({ t: "start", setup, you: g.seat });
    }
    this.changed();
  }

  /** The match is over: back to waiting, everyone still in. */
  finish(): void {
    this.playing = false;
    for (const g of this.guests.values()) {
      g.queue = null;
      g.seat = -1;
    }
    if (this.open && this.count() >= 2) this.autoAt = Date.now() + AUTO_START_S * 1000;
    this.changed();
  }

  /**
   * The input for a seat this step, or null to let a CPU drive (nobody there, or nothing heard for a while: the
   * phone went to the home screen).
   */
  input(seat: number) {
    for (const g of this.guests.values()) {
      if (g.seat !== seat || !g.queue) continue;
      if (Date.now() - g.heard > 3000) return null;
      return g.queue.next();
    }
    return null;
  }

  /** Sends each phone the snapshot, with its own last used input and its own player. */
  send(s: Snap, me: (seat: number) => Snap["me"], every: number, last = false): void {
    for (const g of this.guests.values()) {
      if (!g.queue) continue;
      // The fallback goes slower. The last one of a match always arrives.
      if (g.link.relayed && every % 2 === 1 && !last) continue;
      const msg = { t: "s", s: { ...s, a: g.queue.ack, me: me(g.seat) } };
      if (last) g.link.safe(msg);
      else g.link.fast(msg);
    }
  }

  sendEvents(t: number, list: SimEvent[]): void {
    if (!list.length) return;
    for (const g of this.guests.values()) if (g.queue) g.link.safe({ t: "e", at: t, e: list });
  }

  leave(): void {
    if (this.gone) return;
    this.gone = true;
    clearInterval(this.beacon);
    for (const g of this.guests.values()) g.link.close();
    this.guests.clear();
    this.topic?.leave();
    this.lobby?.leave();
  }
}

/** A phone that joined someone else's room. */
export class GuestRoom {
  private link: Link | null = null;
  private topic: Topic | null = null;
  private gone = false;
  private last: RoomState | null = null;
  /** When a quick match room will start, by this phone's clock. */
  private autoAt: number | null = null;

  constructor(
    private env: RoomEnv,
    private picks: Picks,
    readonly code: string,
    private on: RoomEvents,
  ) {}

  /** Knocks on the room; resolves once in, rejects with a reason ("none", "full", "playing", "ticket", "link"). */
  async begin(): Promise<void> {
    const name = `fc:room:${this.code}`;
    const t = await this.env.signal.join(name);
    this.topic = t;
    let link: ReturnType<typeof openLink> | null = null;
    let host = "";
    const answer = new Promise<string>((resolve, reject) => {
      const knock = () => t.send("hello", { to: this.code, from: this.env.me.id, ticket: this.env.me.ticket, picks: this.picks });
      knock();
      const again = setInterval(knock, 1500);
      const give = setTimeout(() => {
        clearInterval(again);
        reject(new Error("none"));
      }, 6500);
      t.on((event, p) => {
        if (p.to !== this.env.me.id && !(event === "ok" || event === "nope")) return;
        if (event === "nope" && p.to === this.env.me.id) {
          clearInterval(again);
          clearTimeout(give);
          reject(new Error(typeof p.why === "string" ? p.why : "closed"));
        } else if (event === "ok" && p.to === this.env.me.id && typeof p.host === "string" && !link) {
          clearInterval(again);
          clearTimeout(give);
          host = p.host;
          resolve(host);
        } else if (link && p.from === host) link.signalIn(event, p);
      });
    });
    try {
      host = await answer;
      link = openLink({ signal: this.env.signal, room: t, roomName: name, me: this.env.me.id, other: host, offer: true, local: this.env.local });
      this.link = await link.ready.catch(() => {
        throw new Error("link");
      });
    } catch (err) {
      t.leave();
      throw err;
    }
    this.link.onMessage((msg, fast) => void this.fromHost(msg, fast));
    this.link.onClose(() => this.end("host"));
    // The topic is only needed while setting up (unless the link goes through it).
    if (!this.link.relayed) setTimeout(() => !this.gone && t.leave(), 4000);
  }

  private async fromHost(msg: Record<string, unknown>, fast: boolean): Promise<void> {
    if (this.gone) return;
    if (fast) {
      if (msg.t === "s" && msg.s && typeof msg.s === "object") this.on.snap(msg.s as Snap);
      return;
    }
    if (msg.t === "s" && msg.s && typeof msg.s === "object") this.on.snap(msg.s as Snap);
    else if (msg.t === "room" && Array.isArray(msg.members)) {
      const members: Member[] = [];
      for (const raw of msg.members.slice(0, ONLINE_MAX) as Array<Record<string, unknown>>) {
        const who = await this.env.check(raw.ticket);
        if (!who || !ANIMALS[String(raw.animal)]) continue;
        members.push({
          id: String(raw.id),
          name: who.name,
          animal: String(raw.animal),
          medic: !!raw.medic,
          team: raw.team === 1 ? 1 : 0,
          slot: Number(raw.slot) | 0,
          host: !!raw.host,
          you: raw.id === this.env.me.id,
        });
      }
      const r = (msg.rules ?? {}) as Partial<Rules>;
      const rules: Rules = {
        world: WORLDS.some((w) => w.id === r.world) ? String(r.world) : "home",
        mode: r.mode === "hoard" || r.mode === "playful" ? r.mode : "capture",
        difficulty: r.difficulty === "easy" || r.difficulty === "hard" ? r.difficulty : "medium",
      };
      this.last = {
        code: this.code,
        rules,
        host: false,
        open: !!msg.open,
        members,
        autoIn: typeof msg.autoIn === "number" ? msg.autoIn : null,
        playing: !!msg.playing,
        slow: !!msg.slow || !!this.link?.relayed,
      };
      this.autoAt = this.last.autoIn === null ? null : Date.now() + this.last.autoIn * 1000;
      this.on.change(this.last);
    } else if (msg.t === "start") {
      const setup = checkSetup(msg.setup);
      const you = Number(msg.you);
      if (setup && Number.isInteger(you) && you >= 0 && you < setup.perTeam * 2) this.on.start(setup, you);
    } else if (msg.t === "e" && Array.isArray(msg.e) && typeof msg.at === "number") {
      this.on.events(msg.at, (msg.e as SimEvent[]).filter((e) => e && typeof e === "object" && typeof e.kind === "string"));
    } else if (msg.t === "bye") this.end("host");
  }

  state(): RoomState | null {
    if (!this.last) return null;
    return { ...this.last, autoIn: this.autoAt === null ? null : Math.max(0, Math.ceil((this.autoAt - Date.now()) / 1000)) };
  }

  pick(p: Picks): void {
    this.picks = p;
    this.link?.safe({ t: "pick", ...p });
  }

  sendInput(frames: InputFrame[]): void {
    this.link?.fast({ t: "in", f: frames });
  }

  get relayed(): boolean {
    return !!this.link?.relayed;
  }

  private end(why: string): void {
    if (this.gone) return;
    this.gone = true;
    this.topic?.leave();
    this.on.closed(why);
  }

  leave(): void {
    if (this.gone) return;
    this.gone = true;
    this.link?.close();
    this.topic?.leave();
  }
}

/** Open quick match rooms heard on the lobby in `ms`, fullest first. */
export async function findRooms(signal: Signal, ms = 2500): Promise<string[]> {
  const t = await signal.join(LOBBY);
  const seen = new Map<string, number>();
  t.on((event, p) => {
    if (event !== "room" || p.v !== 1 || typeof p.code !== "string" || !cleanCode(p.code)) return;
    const n = Number(p.n);
    if (Number.isFinite(n) && n < ONLINE_MAX) seen.set(p.code, n);
  });
  await new Promise((r) => setTimeout(r, ms));
  t.leave();
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
