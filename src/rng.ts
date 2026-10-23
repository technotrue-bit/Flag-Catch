/**
 * FLAG CATCH: deterministic RNG. All gameplay randomness goes through a
 * seeded generator so a seed replays the same match.
 */
export type RNG = () => number;

/** Mulberry32: tiny, fast, fully seeded. */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0 || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
