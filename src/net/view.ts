/**
 * Online matches are run by one phone, the host, in its own frame: host player 0 on team 0, the south base. Every
 * other phone sees the same match from its own side, so the rest of the game (camera, HUD, minimap, calls) can keep
 * treating player 0 as "you" and team 0 as "your team":
 *
 * - your player is swapped into slot 0 of your team,
 * - a player on the host's team 1 sees the island turned half round its middle, with the teams swapped (the map is
 *   point symmetric, so (x, z) and (-x, -z) are the same ground).
 *
 * A View maps host numbers (player, flag, base and station ids, teams, positions, headings) into this phone's frame,
 * and directions back the other way for the input sent to the host.
 */
import type { Team } from "../sim";

export interface View {
  /** True when the island is turned round for this phone (you play on the host's team 1). */
  readonly flip: boolean;
  player(hostId: number): number;
  /** The host id of a player in this frame. */
  hostPlayer(localId: number): number;
  team(t: Team): Team;
  flag(hostId: number): number;
  base(hostId: number): number;
  station(hostId: number): number;
  /** A position or a velocity: x and z swap sign when flipped. */
  x(v: number): number;
  z(v: number): number;
  heading(h: number): number;
}

interface Spot {
  x: number;
  z: number;
}

/**
 * `me` is your player's id in the host's match, `perTeam` the team size, `flagsPerTeam` the flags a side; `bases` and
 * `stations` are the match's own (the same on every phone, being the same map), used to pair each one with its
 * mirror.
 */
export function makeView(me: number, perTeam: number, flagsPerTeam: number, bases: readonly (Spot & { team: Team })[], stations: readonly Spot[]): View {
  const myTeam = Math.floor(me / perTeam) as Team;
  const mySlot = me % perTeam;
  const flip = myTeam === 1;
  const total = perTeam * 2;
  const toLocal = new Int32Array(total);
  const toHost = new Int32Array(total);
  for (let h = 0; h < total; h++) {
    const t = Math.floor(h / perTeam);
    const s = h % perTeam;
    const lt = flip ? 1 - t : t;
    const ls = t === myTeam ? (s === mySlot ? 0 : s === 0 ? mySlot : s) : s;
    const l = lt * perTeam + ls;
    toLocal[h] = l;
    toHost[l] = h;
  }
  const mirror = (list: readonly Spot[]): Int32Array => {
    const out = new Int32Array(list.length);
    list.forEach((a, i) => {
      if (!flip) {
        out[i] = i;
        return;
      }
      let best = i;
      let bestD = Infinity;
      list.forEach((b, j) => {
        const d = Math.hypot(b.x + a.x, b.z + a.z);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      out[i] = best;
    });
    return out;
  };
  const baseMap = mirror(bases);
  const stationMap = mirror(stations);
  const sign = flip ? -1 : 1;
  return {
    flip,
    player: (h) => (h >= 0 && h < total ? toLocal[h] : h),
    hostPlayer: (l) => (l >= 0 && l < total ? toHost[l] : l),
    team: (t) => (flip ? ((1 - t) as Team) : t),
    flag: (h) => (!flip || h < 0 ? h : h < flagsPerTeam ? h + flagsPerTeam : h - flagsPerTeam),
    base: (h) => (h >= 0 && h < baseMap.length ? baseMap[h] : h),
    station: (h) => (h >= 0 && h < stationMap.length ? stationMap[h] : h),
    x: (v) => v * sign,
    z: (v) => v * sign,
    heading: (h) => (flip ? wrap(h + Math.PI) : h),
  };
}

function wrap(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}
