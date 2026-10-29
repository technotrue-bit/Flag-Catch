/**
 * The safety net for a steady 60: when the phone keeps missing frames, draw
 * the game a little less sharp until it keeps up. A phone that drew at 2x
 * steps to 1.75, 1.5 and so on, never below 1x. After a long calm spell it
 * tries one step sharper again, and if that brings the drops back it stays
 * where it was for the rest of the visit.
 *
 * Pure, so the tests can feed it frame times; main.ts applies the answer.
 */

/** A frame this long or longer missed a 60 Hz beat. */
export const SLOW_MS = 21;
/** How many frames are judged together. */
const WINDOW = 90;
/** A window with this share of slow frames steps the sharpness down. */
const DROP_SHARE = 0.2;
/** Calm windows in a row before trying a step sharper. */
const CALM_WINDOWS = 8;
/** A window counts as calm with at most this share of slow frames. */
const CALM_SHARE = 0.03;

export class Sharpness {
  ratio: number;
  private ceiling: number;
  private frames = 0;
  private slow = 0;
  private calm = 0;
  /** Windows judged since the last step up, while that step is on trial. */
  private trial = -1;
  /** Frames kept dropping with no sharpness left to give. */
  private stuck = false;

  constructor(
    readonly max: number,
    public min = 1,
    readonly step = 0.25,
  ) {
    this.max = Math.max(min, max);
    this.ratio = this.max;
    this.ceiling = this.max;
  }

  /**
   * One frame's length in ms. Returns the new pixel ratio when it should
   * change, else null. Long gaps (a hidden tab, a menu) are not frames.
   */
  frame(ms: number): number | null {
    if (!(ms > 0) || ms > 600) return null;
    this.frames++;
    if (ms >= SLOW_MS) this.slow++;
    if (this.frames < WINDOW) return null;
    const share = this.slow / this.frames;
    this.frames = this.slow = 0;
    if (share >= DROP_SHARE) {
      this.calm = 0;
      // The step up just tried didn't hold: don't try it again this visit.
      if (this.trial >= 0) this.ceiling = this.ratio - this.step;
      this.trial = -1;
      const next = this.set(this.ratio - this.step);
      if (next === null) this.stuck = true;
      return next;
    }
    if (this.trial >= 0 && ++this.trial >= 3) this.trial = -1;
    this.calm = share <= CALM_SHARE ? this.calm + 1 : 0;
    if (this.calm >= CALM_WINDOWS && this.ratio < this.ceiling) {
      this.calm = 0;
      this.trial = 0;
      return this.set(this.ratio + this.step);
    }
    return null;
  }

  /**
   * True once since frames last kept dropping at the lowest sharpness, so the
   * caller can give up something else instead (High's glow, then its shadows).
   */
  struggling(): boolean {
    const was = this.stuck;
    this.stuck = false;
    return was;
  }

  private set(r: number): number | null {
    const next = Math.round(Math.min(this.ceiling, Math.max(this.min, r)) * 100) / 100;
    if (next === this.ratio) return null;
    this.ratio = next;
    return next;
  }
}
