/**
 * The ticker: one block under the score that says what just happened. It rests on which land you are in; news
 * (a flag taken, a score, a hit) rolls in from the top, holds for a beat, then rolls on to the next news or back to
 * the land. Pure queue logic here so the tests can run it; the HUD draws the block.
 */

export interface TickerNews {
  text: string;
  color: string;
}

/** News waiting at most; past this the oldest is dropped, so the block never runs far behind the game. */
export const TICKER_MAX = 3;
/** Seconds a piece of news holds, and the shorter hold when more is waiting. */
export const TICKER_HOLD = 1.6;
export const TICKER_HOLD_BUSY = 0.95;

export class TickerQueue {
  private waiting: TickerNews[] = [];
  /** What the block shows now, or null while it rests on the land. */
  showing: TickerNews | null = null;
  /** Seconds left on what it shows. */
  left = 0;

  get size(): number {
    return this.waiting.length;
  }

  /** Queue news. The same words as the news showing or last queued are dropped: one block says it once. */
  push(news: TickerNews): void {
    const last = this.waiting[this.waiting.length - 1] ?? this.showing;
    if (last && last.text === news.text) {
      // Said again: it holds a little longer instead of rolling in twice.
      if (last === this.showing) this.left = Math.max(this.left, TICKER_HOLD * 0.6);
      return;
    }
    this.waiting.push(news);
    while (this.waiting.length > TICKER_MAX) this.waiting.shift();
  }

  /**
   * Moves time on by `dt` seconds. Returns the news to roll in now, "rest" to roll back to the land, or null to
   * keep showing what's there.
   */
  step(dt: number): TickerNews | "rest" | null {
    if (this.showing) {
      this.left -= dt;
      // News waiting cuts the hold short.
      if (this.waiting.length && this.left > TICKER_HOLD_BUSY) this.left = TICKER_HOLD_BUSY;
      if (this.left > 0) return null;
    }
    const next = this.waiting.shift();
    if (next) {
      this.showing = next;
      this.left = this.waiting.length ? TICKER_HOLD_BUSY : TICKER_HOLD;
      return next;
    }
    if (this.showing) {
      this.showing = null;
      return "rest";
    }
    return null;
  }

  clear(): void {
    this.waiting.length = 0;
    this.showing = null;
    this.left = 0;
  }
}

/** Ink or white text, whichever reads better on `bg` (a #rrggbb color). */
export function inkOn(bg: string): "ink" | "white" {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "white";
  const v = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  // Above about this, dark text has more contrast than white.
  return lum > 0.4 ? "ink" : "white";
}
