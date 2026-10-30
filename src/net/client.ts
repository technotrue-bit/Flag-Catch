/**
 * The joining phone's clock on the host's match. Snapshots arrive about 20 times a second, a little unevenly, so the
 * phone draws everyone else a short moment behind the newest one, sliding smoothly between the two either side of
 * that moment; and it plays each match event (a grab, a pop, a score) when the drawing reaches the time it happened.
 */
import type { SimEvent } from "../sim";
import type { Snap } from "./snap";

/** How far behind the newest snapshot others are drawn, in seconds: direct links, and the slower fallback. */
export const DELAY = 0.1;
export const DELAY_RELAYED = 0.3;

export class SnapBuffer {
  private list: Snap[] = [];
  /** Host match time minus this phone's clock, as best seen so far. */
  private offset: number | null = null;
  delay = DELAY;
  /** This phone's clock when the last snapshot came. */
  heardAt = 0;

  push(s: Snap, now: number): void {
    if (typeof s?.t !== "number" || !Number.isFinite(s.t) || !Array.isArray(s.P)) return;
    this.heardAt = now;
    const o = s.t - now;
    // The fastest arrivals say where the host's clock really is; slower ones only nudge it.
    if (this.offset === null || o > this.offset) this.offset = o;
    else this.offset += (o - this.offset) * 0.02;
    const last = this.list[this.list.length - 1];
    if (!last || s.t > last.t) this.list.push(s);
    else if (!this.list.some((x) => x.t === s.t)) {
      this.list.push(s);
      this.list.sort((a, b) => a.t - b.t);
    }
    if (this.list.length > 40) this.list.splice(0, this.list.length - 40);
  }

  /** The host time to draw at now. */
  time(now: number): number {
    return this.offset === null ? 0 : now + this.offset - this.delay;
  }

  /** The two snapshots either side of host time `t`, and how far between them it is. */
  at(t: number): { a: Snap; b: Snap; k: number } | null {
    const l = this.list;
    if (!l.length) return null;
    if (t <= l[0].t) return { a: l[0], b: l[0], k: 1 };
    for (let i = 1; i < l.length; i++) {
      if (l[i].t >= t) {
        const a = l[i - 1];
        const b = l[i];
        return { a, b, k: b.t > a.t ? (t - a.t) / (b.t - a.t) : 1 };
      }
    }
    const last = l[l.length - 1];
    return { a: last, b: last, k: 1 };
  }

  newest(): Snap | undefined {
    return this.list[this.list.length - 1];
  }

  clear(): void {
    this.list.length = 0;
    this.offset = null;
  }
}

/** Match events waiting for the drawing to reach their time. */
export class EventQueue {
  private waiting: Array<{ at: number; e: SimEvent }> = [];

  push(at: number, list: SimEvent[]): void {
    for (const e of list) this.waiting.push({ at, e });
    if (this.waiting.length > 400) this.waiting.splice(0, this.waiting.length - 400);
  }

  /** The events up to host time `t`, oldest first. */
  due(t: number): SimEvent[] {
    let n = 0;
    while (n < this.waiting.length && this.waiting[n].at <= t) n++;
    return n ? this.waiting.splice(0, n).map((w) => w.e) : [];
  }

  clear(): void {
    this.waiting.length = 0;
  }
}
