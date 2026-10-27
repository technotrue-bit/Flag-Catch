/**
 * FLAG CATCH: deterministic RNG. All gameplay randomness goes through a
 * seeded generator so a seed replays the same match.
 */
export type RNG = (() => number) & {
  /** The generator's whole state, so a saved match carries on with the same rolls. */
  state?: { a: number };
};

/** Mulberry32: tiny, fast, fully seeded. */
export function mulberry32(seed: number): RNG {
  const state = { a: seed >>> 0 || 1 };
  const next = () => {
    let a = state.a | 0;
    a = (a + 0x6d2b79f5) | 0;
    state.a = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, { state });
}
