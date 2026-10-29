/**
 * The animals: round, soft toy figures with big friendly eyes, each riding
 * its own little vehicle (or flying). Parts are smooth balls, capsules,
 * cones and rounded boxes on the shared toon ramp, outlined with a thin ink
 * shell, and baked down to a few meshes per animal so 128 of them stay cheap.
 *
 * The rig gives the animator something to move: the body leans and bounces,
 * the head looks about, wings and flippers flap, wheels spin and the frog's
 * pogo stick springs.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RAMP } from "./models";

export interface AnimalRig {
  root: THREE.Group;
  /** Tilts, bobs and squashes with movement. */
  body: THREE.Group;
  /** Looks around and nods; a child of the body. */
  head: THREE.Group;
  wings: THREE.Object3D[];
  wheels: THREE.Object3D[];
  /** The frog's spring: squashes as it lands. */
  pogo?: THREE.Object3D;
  /** How it moves, for the animator. */
  style: "ride" | "fly" | "hop" | "swim";
  /** Where a carried flag rides. */
  flagMount: THREE.Object3D;
  /**
   * The whole animal in its resting pose as one shape, in its body's space,
   * without the ink outline (a fraction of a pixel by then). Crowds of
   * animals farther off are drawn from it, every one of a kind in one batch.
   */
  far: THREE.BufferGeometry;
  /** How big it stands, for the tiny stand-ins drawn far off. */
  size: THREE.Vector3;
  /** Its main color, for the same. */
  tint: THREE.Color;
}

const INK = new THREE.Color("#2a2238");
const PUPIL = "#231c33";
const WHITE = "#fffdf6";
const BLUSH = "#ff8fa3";
const TIRE = "#3b3550";
const METAL = "#c9ced8";

// Shared unit shapes. A ball is a unit sphere scaled to its size (diameters).
const sphereHi = new THREE.SphereGeometry(0.5, 12, 8);
const sphereLo = new THREE.SphereGeometry(0.5, 8, 6);
const coneGeo = new THREE.ConeGeometry(0.5, 1, 10);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const torusGeo = new THREE.TorusGeometry(0.5, 0.12, 6, 16);

const capCache = new Map<string, THREE.BufferGeometry>();
const rboxCache = new Map<string, THREE.BufferGeometry>();

type V3 = readonly [number, number, number];

/** A part to be baked: its color, and whether it gets an ink outline. */
function part(geo: THREE.BufferGeometry, color: string, ink = true): THREE.Mesh {
  const m = new THREE.Mesh(geo);
  m.userData.color = color;
  m.userData.ink = ink;
  return m;
}

function ball(color: string, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, ink = true): THREE.Mesh {
  const m = part(Math.max(sx, sy, sz) > 0.45 ? sphereHi : sphereLo, color, ink);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

function rbox(color: string, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, r = 0.1): THREE.Mesh {
  const rr = Math.min(r, sx / 2 - 0.001, sy / 2 - 0.001, sz / 2 - 0.001);
  const key = `${sx}|${sy}|${sz}|${rr}`;
  let g = rboxCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(sx, sy, sz, 2, rr);
    rboxCache.set(key, g);
  }
  const m = part(g, color);
  m.position.set(x, y, z);
  return m;
}

/** A rounded tube from `a` to `b`: arms, legs, tails, poles. */
function limb(color: string, r: number, a: V3, b: V3, ink = true): THREE.Mesh {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = Math.max(0.01, dir.length());
  const key = `${r.toFixed(3)}|${len.toFixed(3)}`;
  let g = capCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, len, 3, 8);
    capCache.set(key, g);
  }
  const m = part(g, color, ink);
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** A cone with its tip along +y, then turned by (rx, ry, rz). */
function cone(color: string, r: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, ink = true): THREE.Mesh {
  const m = part(coneGeo, color, ink);
  m.scale.set(r * 2, h, r * 2);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

function cyl(color: string, r: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, ink = true): THREE.Mesh {
  const m = part(cylGeo, color, ink);
  m.scale.set(r * 2, h, r * 2);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

function ring(color: string, r: number, x: number, y: number, z: number, rx = Math.PI / 2, ink = false): THREE.Mesh {
  const m = part(torusGeo, color, ink);
  m.scale.setScalar(r * 2);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}

/** Two big friendly eyes looking forward from the face at depth `z`. */
function eyes(g: THREE.Group, sep: number, y: number, z: number, r = 0.13, iris = PUPIL): void {
  for (const s of [-1, 1]) {
    g.add(ball(WHITE, r * 2, r * 2.3, r * 1.4, s * sep, y, z));
    g.add(ball(iris, r * 1.25, r * 1.5, r * 0.8, s * sep, y - r * 0.1, z + r * 0.42, false));
    if (iris !== PUPIL) g.add(ball(PUPIL, r * 0.7, r * 1.1, r * 0.5, s * sep, y - r * 0.1, z + r * 0.6, false));
    g.add(ball(WHITE, r * 0.5, r * 0.5, r * 0.3, s * sep + r * 0.28, y + r * 0.35, z + r * 0.72, false));
  }
}

function blush(g: THREE.Group, sep: number, y: number, z: number): void {
  for (const s of [-1, 1]) g.add(ball(BLUSH, 0.2, 0.11, 0.06, s * sep, y, z, false));
}

/** A spinning wheel: tire, hub cap and one bright spoke so the spin shows. */
function wheel(x: number, y: number, z: number, r: number, w: number, hub = METAL): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(cyl(TIRE, r, w, 0, 0, 0, 0, 0, Math.PI / 2));
  g.add(cyl(hub, r * 0.55, w + 0.04, 0, 0, 0, 0, 0, Math.PI / 2, false));
  g.add(rbox("#fffdf6", w + 0.06, r * 1.3, r * 0.22, 0, 0, 0, 0.02));
  return g;
}

/** A neck scarf in the team color: every animal wears one. */
function scarf(g: THREE.Group, team: string, y: number, z: number, w: number, d = w): void {
  g.add(ball(team, w, 0.24, d, 0, y, z));
  g.add(ball(team, 0.22, 0.32, 0.12, w * 0.22, y - 0.16, z - d * 0.42));
}

const built = new Map<string, AnimalRig>();

/**
 * An animal for a team. The first of each kind is built and baked; the rest
 * are copies sharing its geometry, so a 64 a side match loads fast.
 */
export function buildAnimal(id: string, team: string): AnimalRig {
  const key = `${id}|${team}`;
  let master = built.get(key);
  if (!master) {
    master = makeAnimal(id, team);
    built.set(key, master);
  }
  const root = master.root.clone(true);
  const find = (name: string) => root.getObjectByName(name)!;
  const count = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => find(`${prefix}${i}`));
  const body = find("body") as THREE.Group;
  return {
    root,
    body,
    // One crowd shape per kind and team, shared by every copy.
    far: master.far,
    size: master.size,
    tint: master.tint,
    head: find("head") as THREE.Group,
    wings: count("wing", master.wings.length),
    wheels: count("wheel", master.wheels.length),
    pogo: master.pogo ? find("pogo") : undefined,
    style: master.style,
    flagMount: find("flagMount"),
  };
}

function makeAnimal(id: string, team: string): AnimalRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  root.add(body);
  body.add(head);
  const wings: THREE.Object3D[] = [];
  const wheels: THREE.Object3D[] = [];
  const flagMount = new THREE.Object3D();
  let pogo: THREE.Group | undefined;
  let style: AnimalRig["style"] = "ride";
  const add = (...m: THREE.Object3D[]) => body.add(...m);
  const flap = (x: number, y: number, z: number, ...parts: THREE.Object3D[]) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    p.add(...parts);
    body.add(p);
    wings.push(p);
    return p;
  };
  const wheelAt = (w: THREE.Group) => {
    body.add(w);
    wheels.push(w);
  };

  switch (id) {
    case "lion": {
      // Quad bike.
      add(rbox("#e84d5b", 1.35, 0.42, 1.95, 0, 0.62, 0, 0.16));
      add(rbox(team, 0.3, 0.06, 1.97, 0, 0.85, 0, 0.02));
      for (const [x, z] of [[-0.78, 0.66], [0.78, 0.66], [-0.78, -0.66], [0.78, -0.66]] as const) {
        add(rbox("#c23a48", 0.48, 0.12, 0.72, x, 0.95, z, 0.05));
        wheelAt(wheel(x, 0.4, z, 0.4, 0.34));
      }
      add(rbox(TIRE, 0.7, 0.16, 0.7, 0, 0.92, -0.3, 0.07));
      add(ball("#fff4c2", 0.28, 0.24, 0.12, 0, 0.72, 0.98));
      add(limb(TIRE, 0.06, [0, 0.85, 0.75], [0, 1.3, 0.7]));
      add(limb(TIRE, 0.06, [-0.45, 1.3, 0.7], [0.45, 1.3, 0.7]));
      add(ball("#f2b33d", 0.95, 0.95, 0.85, 0, 1.38, -0.15));
      add(ball("#ffe3a3", 0.6, 0.6, 0.3, 0, 1.32, 0.22));
      for (const s of [-1, 1]) {
        add(limb("#f2b33d", 0.13, [s * 0.38, 1.55, 0], [s * 0.42, 1.32, 0.66]));
        add(ball("#ffe3a3", 0.22, 0.2, 0.22, s * 0.42, 1.32, 0.7));
        add(limb("#f2b33d", 0.15, [s * 0.3, 1.05, 0], [s * 0.5, 0.95, 0.35]));
      }
      add(limb("#f2b33d", 0.06, [0, 1.15, -0.55], [0, 1.55, -1.0]));
      add(ball("#b4622d", 0.26, 0.26, 0.26, 0, 1.6, -1.05));
      head.position.set(0, 2.0, 0.05);
      head.add(ball("#b4622d", 1.2, 1.12, 0.8, 0, 0, -0.08));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        head.add(ball("#a8562a", 0.42, 0.42, 0.42, Math.cos(a) * 0.55, Math.sin(a) * 0.5, -0.12));
      }
      head.add(ball("#f2b33d", 0.82, 0.76, 0.72, 0, 0, 0.16));
      head.add(ball("#ffe3a3", 0.46, 0.32, 0.32, 0, -0.15, 0.48));
      head.add(ball("#7a3d2a", 0.17, 0.12, 0.1, 0, -0.06, 0.63, false));
      for (const s of [-1, 1]) head.add(ball("#f2b33d", 0.24, 0.24, 0.14, s * 0.33, 0.34, 0.12));
      eyes(head, 0.18, 0.1, 0.46);
      blush(head, 0.3, -0.1, 0.44);
      scarf(body, team, 1.72, 0.0, 0.88, 0.78);
      flagMount.position.set(0, 1.7, -0.7);
      break;
    }
    case "penguin": {
      // Surfboard.
      add(rbox("#ffd166", 0.95, 0.14, 2.3, 0, 0.12, -0.15, 0.06));
      add(ball("#ffd166", 0.95, 0.14, 0.9, 0, 0.12, 0.95));
      add(rbox(team, 0.2, 0.04, 2.3, 0, 0.2, -0.1, 0.015));
      add(ball("#2f3448", 1.0, 1.35, 0.92, 0, 1.0, 0));
      add(ball("#f4f1e8", 0.74, 1.05, 0.52, 0, 0.94, 0.22));
      for (const s of [-1, 1]) add(ball("#ff9f1c", 0.3, 0.13, 0.46, s * 0.22, 0.26, 0.15));
      for (const s of [-1, 1]) flap(s * 0.48, 1.3, 0, ball("#2f3448", 0.16, 0.8, 0.4, s * 0.06, -0.32, 0));
      head.position.set(0, 1.85, 0.02);
      head.add(ball("#2f3448", 0.84, 0.78, 0.78));
      head.add(ball("#f4f1e8", 0.58, 0.48, 0.32, 0, -0.04, 0.27));
      head.add(cone("#ff9f1c", 0.11, 0.3, 0, -0.1, 0.5, Math.PI / 2));
      eyes(head, 0.16, 0.08, 0.38, 0.12);
      blush(head, 0.27, -0.1, 0.36);
      head.add(ball(team, 0.72, 0.38, 0.72, 0, 0.3, -0.02));
      head.add(ball(WHITE, 0.22, 0.22, 0.22, 0, 0.52, -0.04));
      flagMount.position.set(0, 1.6, -0.5);
      style = "swim";
      break;
    }
    case "croc": {
      // Two water skis, long snout forward.
      for (const x of [-0.36, 0.36]) {
        add(rbox("#ffd166", 0.28, 0.1, 2.7, x, 0.08, 0.0, 0.04));
        add(ball("#ffd166", 0.28, 0.18, 0.4, x, 0.16, 1.35));
        add(rbox(team, 0.08, 0.03, 2.4, x, 0.14, 0, 0.01));
      }
      add(ball("#4f9d5a", 0.95, 0.9, 1.3, 0, 0.85, -0.1));
      add(ball("#a6d98a", 0.66, 0.72, 0.42, 0, 0.8, 0.38));
      for (let k = 0; k < 3; k++) add(cone("#3e8049", 0.1, 0.22, 0, 1.25 - k * 0.05, -0.1 - k * 0.32, -0.3));
      add(limb("#4f9d5a", 0.2, [0, 0.62, -0.65], [0, 0.32, -1.45]));
      add(ball("#4f9d5a", 0.22, 0.22, 0.3, 0, 0.3, -1.55));
      for (const s of [-1, 1]) add(ball("#4f9d5a", 0.3, 0.3, 0.42, s * 0.3, 0.32, 0.1));
      for (const s of [-1, 1]) flap(s * 0.44, 1.05, 0.25, limb("#4f9d5a", 0.11, [0, 0, 0], [s * 0.12, -0.4, 0.15]));
      head.position.set(0, 1.45, 0.32);
      head.add(ball("#4f9d5a", 0.82, 0.62, 0.78));
      head.add(ball("#4f9d5a", 0.62, 0.3, 1.0, 0, -0.12, 0.55));
      head.add(ball("#a6d98a", 0.56, 0.18, 0.86, 0, -0.27, 0.5));
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) head.add(cone(WHITE, 0.035, 0.09, s * 0.22, -0.19, 0.4 + k * 0.17, 0, 0, 0, false));
        head.add(ball("#2a5a33", 0.06, 0.05, 0.05, s * 0.09, -0.02, 1.02, false));
        head.add(ball("#4f9d5a", 0.3, 0.3, 0.3, s * 0.2, 0.24, 0.12));
      }
      eyes(head, 0.2, 0.3, 0.24, 0.11);
      head.add(ball(team, 0.84, 0.15, 0.8, 0, 0.1, -0.02));
      flagMount.position.set(0, 1.6, -0.6);
      style = "swim";
      break;
    }
    case "bird": {
      // Motorbike.
      add(rbox("#3a6ea5", 0.46, 0.4, 1.55, 0, 0.75, 0, 0.12));
      add(ball("#3a6ea5", 0.52, 0.36, 0.62, 0, 1.02, 0.32));
      add(rbox(team, 0.12, 0.05, 0.6, 0, 1.2, 0.32, 0.02));
      add(rbox(TIRE, 0.36, 0.14, 0.6, 0, 1.0, -0.35, 0.06));
      add(limb(METAL, 0.05, [0.2, 0.6, -0.6], [0.24, 0.7, -1.0]));
      add(limb(METAL, 0.05, [0, 0.6, 0.75], [0, 1.25, 0.62]));
      add(limb(TIRE, 0.05, [-0.42, 1.27, 0.62], [0.42, 1.27, 0.62]));
      add(ball("#fff4c2", 0.22, 0.2, 0.1, 0, 1.08, 0.72));
      for (const z of [0.85, -0.85]) wheelAt(wheel(0, 0.45, z, 0.45, 0.26));
      add(ball("#ffcf56", 0.92, 0.88, 0.88, 0, 1.45, -0.2));
      add(ball("#fff0b3", 0.6, 0.56, 0.42, 0, 1.38, 0.1));
      for (const s of [-1, 1]) {
        add(limb("#ff9f1c", 0.06, [s * 0.2, 1.1, -0.2], [s * 0.25, 0.85, 0.05]));
        flap(s * 0.43, 1.52, -0.2, ball("#f2b33d", 0.16, 0.5, 0.62, s * 0.06, -0.12, 0));
      }
      for (let k = -1; k <= 1; k++) add(ball("#f2b33d", 0.14, 0.12, 0.5, k * 0.12, 1.45, -0.72));
      head.position.set(0, 1.98, -0.05);
      head.add(ball("#ffcf56", 0.78, 0.72, 0.72));
      head.add(cone("#ff9f1c", 0.11, 0.26, 0, -0.06, 0.42, Math.PI / 2));
      eyes(head, 0.17, 0.06, 0.3, 0.12);
      blush(head, 0.28, -0.1, 0.28);
      head.add(ball(team, 0.82, 0.5, 0.82, 0, 0.17, -0.04));
      head.add(rbox("#2b3a55", 0.6, 0.12, 0.12, 0, 0.2, 0.36, 0.05));
      for (let k = 0; k < 3; k++) head.add(ball("#ff7a3d", 0.1, 0.24, 0.1, 0, 0.45 + k * 0.02, -0.08 - k * 0.11));
      flagMount.position.set(0, 1.75, -0.85);
      break;
    }
    case "eagle": {
      add(ball("#8a5a3b", 0.95, 1.0, 1.35, 0, 1.0, 0));
      add(ball("#c99a68", 0.62, 0.7, 0.5, 0, 0.98, 0.35));
      for (let k = -1; k <= 1; k++) add(ball("#6b4430", 0.26, 0.1, 0.7, k * 0.18, 0.95, -0.85));
      for (const s of [-1, 1]) {
        add(limb("#ffc43d", 0.07, [s * 0.22, 0.65, 0.05], [s * 0.25, 0.32, 0.1]));
        add(ball("#ffc43d", 0.2, 0.1, 0.26, s * 0.25, 0.28, 0.16));
      }
      for (const s of [-1, 1]) {
        flap(
          s * 0.42,
          1.2,
          0,
          ball("#8a5a3b", 1.5, 0.15, 0.75, s * 0.75, 0, 0),
          ball("#6b4430", 0.9, 0.13, 0.6, s * 0.95, -0.02, -0.18),
          ball(team, 0.6, 0.14, 0.62, s * 1.48, 0, -0.06),
        );
      }
      head.position.set(0, 1.65, 0.55);
      head.add(ball("#f4f1e8", 0.76, 0.7, 0.74));
      head.add(ball("#ffc43d", 0.26, 0.2, 0.32, 0, -0.08, 0.42));
      head.add(cone("#ffc43d", 0.09, 0.18, 0, -0.18, 0.55, Math.PI * 0.75));
      eyes(head, 0.18, 0.08, 0.3, 0.12);
      for (const s of [-1, 1]) head.add(rbox("#4a3424", 0.24, 0.06, 0.08, s * 0.18, 0.24, 0.36, 0.02));
      head.add(ball(team, 0.8, 0.14, 0.78, 0, 0.14, -0.02));
      flagMount.position.set(0, 1.5, -0.6);
      style = "fly";
      break;
    }
    case "mammoth": {
      // Skateboard.
      add(rbox("#e8455b", 1.3, 0.12, 2.6, 0, 0.34, 0, 0.06));
      add(rbox(team, 0.3, 0.03, 2.4, 0, 0.41, 0, 0.01));
      for (const [x, z] of [[-0.45, 0.95], [0.45, 0.95], [-0.45, -0.95], [0.45, -0.95]] as const) wheelAt(wheel(x, 0.17, z, 0.16, 0.16, "#ffd166"));
      add(ball("#8a5a3b", 1.5, 1.35, 1.9, 0, 1.25, -0.1));
      for (let k = 0; k < 4; k++) add(ball("#9d6b48", 0.55, 0.4, 0.55, Math.sin(k * 2.1) * 0.35, 1.85, -0.6 + k * 0.3));
      for (const [x, z] of [[-0.45, 0.55], [0.45, 0.55], [-0.45, -0.7], [0.45, -0.7]] as const) add(limb("#7a4d33", 0.2, [x, 0.9, z], [x, 0.48, z]));
      add(limb("#7a4d33", 0.06, [0, 1.2, -1.0], [0, 0.9, -1.25]));
      head.position.set(0, 1.75, 0.85);
      head.add(ball("#7a4d33", 1.15, 1.05, 0.95));
      head.add(limb("#7a4d33", 0.14, [0, -0.15, 0.4], [0, -0.55, 0.55]));
      head.add(limb("#7a4d33", 0.12, [0, -0.55, 0.55], [0, -0.75, 0.8]));
      for (const s of [-1, 1]) {
        head.add(limb(WHITE, 0.06, [s * 0.32, -0.32, 0.3], [s * 0.38, -0.45, 0.72]));
        head.add(limb(WHITE, 0.05, [s * 0.38, -0.45, 0.72], [s * 0.32, -0.3, 0.95]));
      }
      eyes(head, 0.24, 0.1, 0.44, 0.12);
      blush(head, 0.36, -0.12, 0.4);
      head.add(ball(team, 1.0, 0.42, 0.86, 0, 0.42, -0.05));
      head.add(ball(WHITE, 0.24, 0.24, 0.24, 0, 0.66, -0.05));
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(s * 0.55, 0.05, -0.05);
        ear.add(ball("#6b4430", 0.16, 0.78, 0.66, s * 0.06, 0, 0));
        head.add(ear);
        wings.push(ear);
      }
      flagMount.position.set(0, 2.05, -0.8);
      break;
    }
    case "wolf": {
      // Buggy with a launcher on the hood and a roll cage.
      add(rbox("#2fb59a", 1.55, 0.46, 2.3, 0, 0.66, 0, 0.16));
      add(rbox("#23917b", 1.3, 0.28, 0.9, 0, 0.96, 0.62, 0.1));
      add(rbox(team, 0.32, 0.06, 2.32, 0, 0.9, 0, 0.02));
      for (const [x, z] of [[-0.86, 0.8], [0.86, 0.8], [-0.86, -0.8], [0.86, -0.8]] as const) wheelAt(wheel(x, 0.44, z, 0.44, 0.38));
      add(cyl(TIRE, 0.15, 0.95, 0, 1.2, 0.85, Math.PI / 2));
      add(ring("#ff6b5b", 0.13, 0, 1.2, 1.33, 0));
      for (const s of [-1, 1]) {
        add(limb(METAL, 0.05, [s * 0.65, 0.9, -0.85], [s * 0.6, 2.2, -0.65]));
        add(limb(METAL, 0.05, [s * 0.6, 2.2, -0.65], [s * 0.6, 1.0, 0.1]));
      }
      add(limb(METAL, 0.05, [-0.6, 2.2, -0.65], [0.6, 2.2, -0.65]));
      add(ring(TIRE, 0.22, 0, 1.25, 0.2, -0.5, true));
      add(ball("#8d8fa3", 0.85, 0.8, 0.75, 0, 1.25, -0.35));
      add(ball("#f4f1e8", 0.5, 0.5, 0.3, 0, 1.25, -0.05));
      for (const s of [-1, 1]) add(limb("#8d8fa3", 0.11, [s * 0.35, 1.38, -0.3], [s * 0.18, 1.3, 0.15]));
      head.position.set(0, 1.85, -0.25);
      head.add(ball("#8d8fa3", 0.76, 0.7, 0.7));
      head.add(ball("#f4f1e8", 0.42, 0.3, 0.46, 0, -0.13, 0.38));
      head.add(ball("#2b2340", 0.14, 0.1, 0.1, 0, -0.05, 0.62, false));
      for (const s of [-1, 1]) head.add(cone("#6e7086", 0.14, 0.34, s * 0.22, 0.4, -0.02, 0, 0, -s * 0.25));
      eyes(head, 0.16, 0.08, 0.33, 0.11);
      scarf(body, team, 1.58, -0.33, 0.78, 0.7);
      flagMount.position.set(0, 1.6, -0.95);
      break;
    }
    case "shark": {
      // Jet ski.
      add(rbox("#ffd166", 1.0, 0.42, 2.2, 0, 0.3, -0.1, 0.16));
      add(ball("#ffd166", 1.0, 0.42, 1.0, 0, 0.3, 0.95));
      add(rbox(team, 1.02, 0.08, 1.6, 0, 0.42, -0.2, 0.03));
      add(cyl(TIRE, 0.22, 0.3, 0, 0.32, -1.25, Math.PI / 2));
      add(ball("#ff9f1c", 0.3, 0.3, 0.1, 0, 0.32, -1.38, false));
      add(limb(TIRE, 0.05, [0, 0.5, 0.65], [0, 1.15, 0.55]));
      add(limb(TIRE, 0.05, [-0.4, 1.15, 0.55], [0.4, 1.15, 0.55]));
      add(ball("#7a8ca6", 0.92, 0.95, 1.4, 0, 1.08, -0.15));
      add(ball("#eef2f7", 0.66, 0.72, 0.9, 0, 0.98, 0.12));
      add(cone("#6a7c96", 0.22, 0.6, 0, 1.68, -0.4, -0.45));
      add(cone("#6a7c96", 0.18, 0.55, 0, 1.0, -0.95, -1.9));
      add(cone("#6a7c96", 0.14, 0.45, 0, 0.8, -0.9, -1.1));
      for (const s of [-1, 1]) flap(s * 0.42, 1.0, 0.15, ball("#7a8ca6", 0.14, 0.62, 0.38, s * 0.1, -0.24, 0.1));
      head.position.set(0, 1.58, 0.42);
      head.add(ball("#7a8ca6", 0.82, 0.72, 0.82));
      head.add(ball("#eef2f7", 0.58, 0.32, 0.55, 0, -0.2, 0.22));
      head.add(ball("#2b2340", 0.46, 0.1, 0.12, 0, -0.18, 0.43, false));
      for (let k = -2; k <= 2; k++) head.add(cone(WHITE, 0.035, 0.08, k * 0.08, -0.14, 0.47, Math.PI, 0, 0, false));
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) head.add(rbox("#5a6a82", 0.02, 0.18, 0.04, s * 0.41, -0.05, -0.05 - k * 0.1, 0.01));
      eyes(head, 0.2, 0.1, 0.33, 0.12);
      head.add(ball(team, 0.84, 0.16, 0.84, 0, 0.18, -0.04));
      flagMount.position.set(0, 1.55, -0.85);
      style = "swim";
      break;
    }
    case "goldfish": {
      // A fishbowl on a little cart.
      add(rbox("#6c7bd9", 1.3, 0.28, 1.4, 0, 0.45, 0, 0.1));
      add(rbox(team, 1.32, 0.08, 0.3, 0, 0.5, 0, 0.03));
      for (const [x, z] of [[-0.62, 0.55], [0.62, 0.55], [-0.62, -0.55], [0.62, -0.55]] as const) wheelAt(wheel(x, 0.3, z, 0.3, 0.22));
      add(ball("#f2cf8a", 1.15, 0.32, 1.15, 0, 0.68, 0, false));
      add(ring(WHITE, 0.6, 0, 1.75, 0, Math.PI / 2, true));
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(0.78, 18, 12),
        new THREE.MeshToonMaterial({ color: "#9fe0ff", gradientMap: RAMP, transparent: true, opacity: 0.32, depthWrite: false }),
      );
      glass.position.set(0, 1.28, 0);
      glass.userData.keep = true;
      add(glass);
      add(ball("#3fa86a", 0.12, 0.4, 0.12, -0.35, 1.0, -0.3, false));
      add(ball("#3fa86a", 0.12, 0.3, 0.12, -0.25, 0.95, -0.38, false));
      head.position.set(0, 1.3, 0.05);
      head.add(ball("#ff8a2a", 0.62, 0.58, 0.78));
      head.add(ball("#ffb366", 0.4, 0.3, 0.4, 0, -0.14, 0.12, false));
      for (const s of [-1, 1]) head.add(ball("#ff5f3a", 0.08, 0.42, 0.42, s * 0.12, 0.05, -0.55));
      head.add(ball("#ff5f3a", 0.08, 0.3, 0.38, 0, 0.32, -0.05));
      head.add(ball("#ff6b9a", 0.14, 0.1, 0.08, 0, -0.08, 0.4, false));
      eyes(head, 0.17, 0.08, 0.3, 0.12);
      for (const s of [-1, 1]) {
        const fin = new THREE.Group();
        fin.position.set(s * 0.28, -0.08, 0.05);
        fin.add(ball("#ff5f3a", 0.06, 0.26, 0.3, s * 0.03, -0.08, 0, false));
        head.add(fin);
        wings.push(fin);
      }
      add(ball(team, 0.32, 0.32, 0.32, 0, 1.9, -0.45));
      add(limb(METAL, 0.03, [0, 1.6, -0.45], [0, 1.9, -0.45], false));
      flagMount.position.set(0, 1.55, -0.75);
      style = "swim";
      break;
    }
    case "panther": {
      // Kick scooter.
      add(rbox("#ff5fa2", 0.46, 0.1, 1.45, 0, 0.3, 0, 0.04));
      add(rbox(team, 0.2, 0.03, 1.4, 0, 0.36, 0, 0.01));
      for (const z of [0.72, -0.72]) wheelAt(wheel(0, 0.2, z, 0.2, 0.14));
      add(limb(METAL, 0.05, [0, 0.3, 0.72], [0, 1.45, 0.62]));
      add(limb(TIRE, 0.05, [-0.38, 1.45, 0.62], [0.38, 1.45, 0.62]));
      for (const s of [-1, 1]) add(limb("#2b2a3a", 0.13, [s * 0.18, 1.0, -0.1], [s * 0.14, 0.4, 0.0]));
      add(ball("#2b2a3a", 0.75, 0.82, 0.95, 0, 1.3, 0));
      add(ball("#4a4860", 0.46, 0.55, 0.3, 0, 1.3, 0.38));
      for (const s of [-1, 1]) add(limb("#2b2a3a", 0.11, [s * 0.32, 1.5, 0.2], [s * 0.36, 1.45, 0.6]));
      add(limb("#2b2a3a", 0.07, [0, 1.15, -0.45], [0, 1.25, -0.95]));
      add(limb("#2b2a3a", 0.07, [0, 1.25, -0.95], [0, 1.6, -1.15]));
      add(ball(team, 0.18, 0.18, 0.18, 0, 1.65, -1.16));
      head.position.set(0, 1.98, 0.28);
      head.add(ball("#2b2a3a", 0.76, 0.68, 0.72));
      head.add(ball("#4a4860", 0.38, 0.26, 0.3, 0, -0.14, 0.3));
      head.add(ball("#ff8fb1", 0.12, 0.08, 0.08, 0, -0.06, 0.44, false));
      for (const s of [-1, 1]) head.add(cone("#2b2a3a", 0.13, 0.28, s * 0.25, 0.36, -0.02, 0, 0, -s * 0.3));
      eyes(head, 0.17, 0.08, 0.31, 0.12, "#c9f25c");
      head.add(ball(team, 0.78, 0.13, 0.75, 0, 0.17, -0.02));
      flagMount.position.set(0, 1.75, -0.6);
      break;
    }
    case "flyfish": {
      add(ball("#5fb8ff", 0.72, 0.78, 1.5, 0, 1.1, 0));
      add(ball("#dff4ff", 0.5, 0.45, 1.1, 0, 0.92, 0.1));
      for (const s of [-1, 1]) add(ball("#3f8fe0", 0.08, 0.55, 0.5, 0, 1.1 + s * 0.22, -0.95));
      add(ball("#3f8fe0", 0.08, 0.35, 0.6, 0, 1.55, -0.15));
      for (const s of [-1, 1]) {
        flap(
          s * 0.32,
          1.18,
          0.2,
          ball("#a8e6ff", 1.5, 0.08, 0.72, s * 0.72, 0, -0.1),
          ball(team, 0.5, 0.09, 0.55, s * 1.38, 0, -0.18),
          limb("#3f8fe0", 0.025, [0, 0, 0], [s * 1.35, 0, -0.2], false),
        );
      }
      head.position.set(0, 1.18, 0.7);
      head.add(ball("#5fb8ff", 0.64, 0.6, 0.6));
      head.add(ball("#2b2340", 0.14, 0.06, 0.06, 0, -0.1, 0.3, false));
      eyes(head, 0.22, 0.06, 0.18, 0.13);
      head.add(ball(team, 0.66, 0.12, 0.64, 0, 0.15, -0.05));
      flagMount.position.set(0, 1.45, -0.55);
      style = "fly";
      break;
    }
    case "bat": {
      add(ball("#6b5a8a", 0.78, 0.88, 0.75, 0, 1.2, 0));
      add(ball("#9a8ab8", 0.5, 0.6, 0.32, 0, 1.15, 0.24));
      for (const s of [-1, 1]) add(limb("#4a3d63", 0.06, [s * 0.15, 0.85, 0], [s * 0.18, 0.5, 0.05]));
      for (const s of [-1, 1]) {
        const parts: THREE.Object3D[] = [ball("#4a3d63", 1.45, 0.08, 0.85, s * 0.72, -0.05, -0.05)];
        for (let k = 0; k < 3; k++) parts.push(ball("#4a3d63", 0.42, 0.08, 0.36, s * (0.35 + k * 0.42), -0.06, -0.42));
        parts.push(limb("#2e2540", 0.035, [0, 0, 0], [s * 1.35, 0.05, 0.1], false));
        parts.push(ball(team, 0.36, 0.1, 0.3, s * 1.4, 0, 0.1));
        flap(s * 0.34, 1.38, 0, ...parts);
      }
      head.position.set(0, 1.85, 0.05);
      head.add(ball("#6b5a8a", 0.76, 0.7, 0.7));
      for (const s of [-1, 1]) {
        head.add(cone("#6b5a8a", 0.18, 0.55, s * 0.24, 0.48, -0.02, 0, 0, -s * 0.25));
        head.add(cone("#ff9fc0", 0.1, 0.36, s * 0.24, 0.44, 0.05, 0, 0, -s * 0.25, false));
        head.add(cone(WHITE, 0.03, 0.08, s * 0.06, -0.2, 0.32, Math.PI, 0, 0, false));
      }
      head.add(ball("#ff9fc0", 0.12, 0.08, 0.08, 0, -0.06, 0.36, false));
      eyes(head, 0.16, 0.08, 0.3, 0.12, "#ffd166");
      scarf(body, team, 1.58, 0.0, 0.7, 0.66);
      flagMount.position.set(0, 1.55, -0.5);
      style = "fly";
      break;
    }
    case "frog": {
      // Pogo stick: the spring part squashes on each bounce.
      pogo = new THREE.Group();
      pogo.add(limb(METAL, 0.05, [0, 0.05, 0.1], [0, 0.55, 0.1]));
      for (let k = 0; k < 4; k++) pogo.add(ring("#ff6b5b", 0.12, 0, 0.12 + k * 0.11, 0.1, Math.PI / 2, true));
      body.add(pogo);
      add(limb(METAL, 0.05, [0, 0.6, 0.1], [0, 1.55, 0.25]));
      add(limb(TIRE, 0.06, [-0.35, 1.55, 0.25], [0.35, 1.55, 0.25]));
      add(rbox(team, 0.9, 0.08, 0.26, 0, 0.62, 0.1, 0.03));
      add(ball("#5fcf5a", 0.95, 0.88, 0.85, 0, 1.05, -0.08));
      add(ball("#d8f5a0", 0.62, 0.6, 0.36, 0, 1.0, 0.22));
      for (const s of [-1, 1]) {
        add(ball("#4fb84f", 0.42, 0.55, 0.55, s * 0.4, 0.8, -0.1));
        add(ball("#4fb84f", 0.3, 0.12, 0.42, s * 0.32, 0.7, 0.15));
        add(limb("#5fcf5a", 0.1, [s * 0.38, 1.25, 0.1], [s * 0.3, 1.52, 0.25]));
      }
      head.position.set(0, 1.68, 0.05);
      head.add(ball("#5fcf5a", 0.98, 0.62, 0.82));
      head.add(ball("#2b2340", 0.56, 0.05, 0.1, 0, -0.12, 0.38, false));
      for (const s of [-1, 1]) head.add(ball("#5fcf5a", 0.36, 0.36, 0.34, s * 0.26, 0.26, 0.1));
      eyes(head, 0.26, 0.3, 0.22, 0.13);
      blush(head, 0.33, -0.05, 0.34);
      head.add(ball(team, 0.86, 0.13, 0.76, 0, 0.05, -0.08));
      flagMount.position.set(0, 1.55, -0.55);
      style = "hop";
      break;
    }
    default:
      return makeAnimal("lion", team);
  }
  body.add(flagMount);
  body.name = "body";
  head.name = "head";
  flagMount.name = "flagMount";
  if (pogo) pogo.name = "pogo";
  wings.forEach((w, i) => (w.name = `wing${i}`));
  wheels.forEach((w, i) => (w.name = `wheel${i}`));
  // Bake: each group of still parts becomes one outlined mesh.
  bake(body, new Set<THREE.Object3D>([head, flagMount, ...wings, ...wheels, ...(pogo ? [pogo] : [])]));
  bake(head, new Set(wings));
  for (const w of [...wings, ...wheels]) bake(w as THREE.Group, new Set());
  if (pogo) bake(pogo, new Set());
  const far = bakeWhole(root, body);
  far.computeBoundingBox();
  const size = far.boundingBox!.getSize(new THREE.Vector3());
  return { root, body, head, wings, wheels, pogo, style, flagMount, far, size, tint: mainColor(far) };
}

/** The color that covers the most of a shape. */
function mainColor(geo: THREE.BufferGeometry): THREE.Color {
  const col = geo.attributes.color as THREE.BufferAttribute;
  const counts = new Map<number, number>();
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    const key = c.fromBufferAttribute(col, i).getHex();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0xffffff;
  let most = 0;
  for (const [key, n] of counts) if (n > most) [best, most] = [key, n];
  return new THREE.Color(best);
}

/** Every baked part under `body`, in its resting pose and without outlines, merged into one shape. */
function bakeWhole(root: THREE.Object3D, body: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const toBody = body.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  const parts: THREE.BufferGeometry[] = [];
  body.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const at = m.multiplyMatrices(toBody, mesh.matrixWorld);
    if (mesh.userData.plain) {
      parts.push((mesh.userData.plain as THREE.BufferGeometry).clone().applyMatrix4(at));
      return;
    }
    // Parts kept out of the bake (glowing bits, spinning wheels) come with an
    // index and no colors; give them the same layout as the baked ones, in
    // their own material's color, or the merge fails and the far animal vanishes.
    let g = mesh.geometry.clone().applyMatrix4(at);
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "color") g.deleteAttribute(name);
    if (!g.attributes.color) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshBasicMaterial;
      paint(g, mat.color ?? new THREE.Color("#ffffff"));
    }
    parts.push(g);
  });
  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

export const animalMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP });
const OUTLINE = 0.035;

/**
 * Replace the plain parts of `group` (not those in `keep`) with one vertex
 * colored mesh. Parts marked ink also get an outline: a copy pushed out
 * along its normals with its faces turned inside out, so only its rim
 * shows around the part, like a pen line, in the same draw call.
 */
function bake(group: THREE.Group, keep: Set<THREE.Object3D>): void {
  const parts: THREE.BufferGeometry[] = [];
  /** The same parts without their outlines, for the crowd shape (see bakeWhole). */
  const plain: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || keep.has(mesh) || mesh.userData.keep || mesh.userData.color === undefined) continue;
    mesh.updateMatrix();
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    const geo = g.index ? g.toNonIndexed() : g;
    color.set(mesh.userData.color as string);
    parts.push(paint(geo, color));
    plain.push(geo);
    if (mesh.userData.ink) parts.push(shell(geo));
    group.remove(mesh);
  }
  if (!parts.length) return;
  const merged = mergeGeometries(parts);
  if (!merged) return;
  const baked = new THREE.Mesh(merged, animalMat);
  baked.userData.plain = mergeGeometries(plain);
  group.add(baked);
}

function paint(geo: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** The inside out ink shell around a part. */
function shell(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const n = pos.count;
  const p = new Float32Array(n * 3);
  const q = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    // Swap two corners of each triangle to turn it inside out.
    for (let k = 0; k < 3; k++) {
      const src = i + (k === 0 ? 0 : k === 1 ? 2 : 1);
      const dst = (i + k) * 3;
      p[dst] = pos.getX(src) + nor.getX(src) * OUTLINE;
      p[dst + 1] = pos.getY(src) + nor.getY(src) * OUTLINE;
      p[dst + 2] = pos.getZ(src) + nor.getZ(src) * OUTLINE;
      // Normals point inward, so the shell stays dark from every side.
      q[dst] = -nor.getX(src);
      q[dst + 1] = -nor.getY(src);
      q[dst + 2] = -nor.getZ(src);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(p, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(q, 3));
  return paint(out, INK);
}
