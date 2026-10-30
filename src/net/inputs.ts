/**
 * Your stick and buttons, sent to the host 30 times a second. Each message carries the last few steps' inputs, so
 * one lost on the way costs nothing. Throw, Item and Flag are counted presses rather than "pressed now", so a press
 * is never lost or used twice, however the messages arrive.
 */
import { type Input, NO_INPUT } from "../sim";

/** [step number, dirX, dirZ, held buttons (1 jump, 2 dive, 4 fire), throws, items, flags planted]. */
export type InputFrame = [number, number, number, number, number, number, number];

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Builds the frames on the phone that plays; a new one each match, so its counts start at 0 with the host's. */
export class InputSender {
  seq = 0;
  private throws = 0;
  private items = 0;
  private plants = 0;
  private recent: InputFrame[] = [];

  /** Counts this step's input and returns its step number. */
  add(input: Input): number {
    this.seq++;
    if (input.throwPressed) this.throws++;
    if (input.useItem) this.items++;
    if (input.plant) this.plants++;
    const held = (input.jump ? 1 : 0) | (input.dive ? 2 : 0) | (input.fire ? 4 : 0);
    this.recent.push([this.seq, r3(input.dirX), r3(input.dirZ), held, this.throws, this.items, this.plants]);
    if (this.recent.length > 12) this.recent.shift();
    return this.seq;
  }

  /** What to send now: the last few steps, oldest first. */
  frames(): InputFrame[] {
    return this.recent.slice();
  }
}

/**
 * Hands the host one input a step for a player on another phone. Steps arrive in bunches, so a few wait in line;
 * if the line runs dry the last stick and held buttons carry on, and if it grows long the oldest are skipped so
 * that player never lags far behind.
 */
export class InputQueue {
  /** The last step used, which goes back to that phone so it knows what the host has seen. */
  ack = 0;
  private line: InputFrame[] = [];
  private newest = 0;
  private last: InputFrame | null = null;
  private used: [number, number, number] = [0, 0, 0];

  constructor(private readonly flip: boolean) {}

  push(frames: readonly unknown[]): void {
    for (const raw of frames) {
      const f = toFrame(raw);
      if (!f || f[0] <= this.newest) continue;
      this.newest = f[0];
      this.line.push(f);
    }
    if (this.line.length > 8) this.line.splice(0, this.line.length - 3);
  }

  next(): Input {
    const f = this.line.shift();
    if (f) {
      this.ack = f[0];
      this.last = f;
    }
    const cur = this.last;
    if (!cur) return NO_INPUT;
    // A pile of presses at once (a long gap) counts as one more, not a burst.
    for (let k = 0; k < 3; k++) if (cur[4 + k] - this.used[k] > 2) this.used[k] = cur[4 + k] - 1;
    const s = this.flip ? -1 : 1;
    const input: Input = {
      dirX: cur[1] * s,
      dirZ: cur[2] * s,
      jump: (cur[3] & 1) !== 0,
      dive: (cur[3] & 2) !== 0,
      fire: (cur[3] & 4) !== 0,
      throwPressed: cur[4] > this.used[0],
      useItem: cur[5] > this.used[1],
      plant: cur[6] > this.used[2],
    };
    // One press used per step; more waiting go on the next steps.
    if (input.throwPressed) this.used[0]++;
    if (input.useItem) this.used[1]++;
    if (input.plant) this.used[2]++;
    return input;
  }
}

function toFrame(raw: unknown): InputFrame | null {
  if (!Array.isArray(raw) || raw.length !== 7) return null;
  if (!raw.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [seq, dx, dz, held, t, i, p] = raw as number[];
  const len = Math.hypot(dx, dz);
  const k = len > 1 ? 1 / len : 1;
  return [Math.floor(seq), dx * k, dz * k, held & 7, Math.max(0, Math.floor(t)), Math.max(0, Math.floor(i)), Math.max(0, Math.floor(p))];
}
