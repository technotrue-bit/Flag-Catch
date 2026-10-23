/**
 * Papercraft style animals built from chunky boxes, riding toy vehicles.
 * The border posts that mark each homeland live here too.
 * Every part is a toon material on the shared 3 band ramp.
 */
import * as THREE from "three";
import { PALETTE } from "./palette";

const rampCanvas = document.createElement("canvas");
rampCanvas.width = 3;
rampCanvas.height = 1;
{
  const ctx = rampCanvas.getContext("2d")!;
  // Dark to light: three.js samples the ramp at dot(N, L) * 0.5 + 0.5.
  ["#8a8aa6", "#c8c8d8", "#ffffff"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i, 0, 1, 1);
  });
}
export const RAMP = new THREE.CanvasTexture(rampCanvas);
RAMP.magFilter = THREE.NearestFilter;
RAMP.minFilter = THREE.NearestFilter;
RAMP.generateMipmaps = false;
RAMP.colorSpace = THREE.NoColorSpace;

const matCache = new Map<string, THREE.MeshToonMaterial>();
export function toon(color: string): THREE.MeshToonMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP });
    matCache.set(color, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);

function box(color: string, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo, toon(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

function wheel(x: number, y: number, z: number, r: number, w: number): THREE.Mesh {
  const m = new THREE.Mesh(cylGeo, toon("#3b3550"));
  m.scale.set(r * 2, w, r * 2);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

export interface AnimalRig {
  root: THREE.Group;
  /** Tilts and bobs with movement. */
  body: THREE.Group;
  wings: THREE.Object3D[];
  wheels: THREE.Object3D[];
  /** Where a carried flag rides. */
  flagMount: THREE.Object3D;
}

export function buildAnimal(id: string, teamColor: string): AnimalRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wings: THREE.Object3D[] = [];
  const wheels: THREE.Object3D[] = [];
  const flagMount = new THREE.Object3D();

  if (id === "lion") {
    // Quad bike.
    body.add(box("#e84d5b", 1.3, 0.35, 1.9, 0, 0.55, 0));
    for (const [x, z] of [[-0.75, 0.65], [0.75, 0.65], [-0.75, -0.65], [0.75, -0.65]] as const) {
      const w = wheel(x, 0.38, z, 0.38, 0.32);
      wheels.push(w);
      body.add(w);
    }
    body.add(box("#f2b33d", 0.9, 0.8, 0.9, 0, 1.15, -0.1));
    body.add(box("#b4622d", 1.25, 1.1, 0.45, 0, 1.75, 0.35));
    body.add(box("#f2b33d", 0.8, 0.7, 0.7, 0, 1.75, 0.5));
    body.add(box("#3b2a2a", 0.12, 0.12, 0.05, -0.18, 1.85, 0.86));
    body.add(box("#3b2a2a", 0.12, 0.12, 0.05, 0.18, 1.85, 0.86));
    body.add(box("#7a3d2a", 0.2, 0.14, 0.08, 0, 1.62, 0.88));
    body.add(box(teamColor, 0.95, 0.16, 0.95, 0, 1.45, 0.05));
    flagMount.position.set(0, 1.6, -0.6);
  } else if (id === "penguin") {
    // Surfboard.
    const board = box("#ffd166", 0.9, 0.14, 2.6, 0, 0.12, 0);
    body.add(board);
    body.add(box(teamColor, 0.18, 0.15, 2.2, 0, 0.17, 0));
    body.add(box("#2f3448", 0.95, 1.4, 0.8, 0, 1.0, 0));
    body.add(box("#f4f1e8", 0.7, 1.05, 0.1, 0, 0.95, 0.42));
    body.add(box("#2f3448", 0.8, 0.65, 0.7, 0, 1.95, 0.05));
    body.add(box("#ff9f1c", 0.3, 0.16, 0.35, 0, 1.9, 0.55));
    body.add(box("#f4f1e8", 0.14, 0.14, 0.05, -0.2, 2.05, 0.41));
    body.add(box("#f4f1e8", 0.14, 0.14, 0.05, 0.2, 2.05, 0.41));
    const lw = box("#2f3448", 0.15, 0.8, 0.45, -0.55, 1.05, 0);
    const rw = box("#2f3448", 0.15, 0.8, 0.45, 0.55, 1.05, 0);
    body.add(lw, rw);
    wings.push(lw, rw);
    body.add(box(teamColor, 0.98, 0.16, 0.84, 0, 1.6, 0));
    flagMount.position.set(0, 1.6, -0.5);
  } else if (id === "wolf") {
    // Four wheeled buggy with a launcher on the hood.
    body.add(box("#2fb59a", 1.5, 0.45, 2.3, 0, 0.62, 0));
    body.add(box("#23917b", 1.3, 0.28, 0.9, 0, 0.95, 0.6));
    body.add(box(teamColor, 0.32, 0.06, 2.32, 0, 0.87, 0));
    for (const [x, z] of [[-0.85, 0.8], [0.85, 0.8], [-0.85, -0.8], [0.85, -0.8]] as const) {
      const w = wheel(x, 0.42, z, 0.42, 0.36);
      wheels.push(w);
      body.add(w);
    }
    const tube = new THREE.Mesh(cylGeo, toon("#3b3550"));
    tube.scale.set(0.3, 0.95, 0.3);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 1.2, 0.8);
    body.add(tube);
    body.add(box("#8d8fa3", 0.85, 0.75, 0.75, 0, 1.2, -0.35));
    body.add(box(teamColor, 0.9, 0.14, 0.8, 0, 1.5, -0.3));
    body.add(box("#8d8fa3", 0.75, 0.6, 0.65, 0, 1.82, -0.2));
    body.add(box("#f4f1e8", 0.4, 0.28, 0.35, 0, 1.7, 0.25));
    body.add(box("#2b2340", 0.14, 0.1, 0.06, 0, 1.8, 0.43));
    body.add(box("#2b2340", 0.11, 0.11, 0.05, -0.17, 1.93, 0.13));
    body.add(box("#2b2340", 0.11, 0.11, 0.05, 0.17, 1.93, 0.13));
    body.add(box("#6e7086", 0.18, 0.32, 0.14, -0.22, 2.25, -0.3));
    body.add(box("#6e7086", 0.18, 0.32, 0.14, 0.22, 2.25, -0.3));
    flagMount.position.set(0, 1.6, -0.9);
  } else {
    // Eagle.
    body.add(box("#8a5a3b", 0.9, 0.85, 1.4, 0, 1.0, 0));
    body.add(box("#f4f1e8", 0.75, 0.7, 0.7, 0, 1.6, 0.55));
    body.add(box("#ffc43d", 0.25, 0.22, 0.35, 0, 1.5, 1.05));
    body.add(box("#2b2340", 0.12, 0.12, 0.05, -0.2, 1.7, 0.91));
    body.add(box("#2b2340", 0.12, 0.12, 0.05, 0.2, 1.7, 0.91));
    body.add(box("#6b4430", 0.6, 0.15, 0.6, 0, 1.0, -0.9));
    body.add(box("#ffc43d", 0.15, 0.4, 0.15, -0.25, 0.4, 0));
    body.add(box("#ffc43d", 0.15, 0.4, 0.15, 0.25, 0.4, 0));
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.45, 1.15, 0);
      const wing = box("#8a5a3b", 1.4, 0.12, 0.8, side * 0.7, 0, 0);
      const tip = box(teamColor, 0.4, 0.13, 0.8, side * 1.3, 0, 0);
      pivot.add(wing, tip);
      body.add(pivot);
      wings.push(pivot);
    }
    flagMount.position.set(0, 1.5, -0.6);
  }
  body.add(flagMount);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false;
  });
  return { root, body, wings, wheels, flagMount };
}

export interface FlagRig {
  root: THREE.Group;
  cloth: THREE.Mesh;
  glow: THREE.Mesh;
}

const clothGeo = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.9, 0, 1.3, -0.45, 0], 3));
  g.setIndex([0, 1, 2]);
  g.computeVertexNormals();
  return g;
})();

export function buildFlag(): FlagRig {
  const root = new THREE.Group();
  const pole = new THREE.Mesh(cylGeo, toon("#f4f1e8"));
  pole.scale.set(0.12, 2.6, 0.12);
  pole.position.y = 1.3;
  root.add(pole);
  const cloth = new THREE.Mesh(clothGeo, new THREE.MeshToonMaterial({ color: "#7ee36b", gradientMap: RAMP, side: THREE.DoubleSide }));
  cloth.position.set(0.06, 2.55, 0);
  root.add(cloth);
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.35, 28),
    new THREE.MeshBasicMaterial({ color: "#7ee36b", transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  root.add(glow);
  return { root, cloth, glow };
}

export function buildTree(scale: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(PALETTE.trunk, 0.5, 2.2, 0.5, 0, 1.1, 0));
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), toon(PALETTE.leaf));
  leaf.position.y = 2.9;
  g.add(leaf);
  const leaf2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), toon(PALETTE.leafLight));
  leaf2.position.set(0.5, 3.6, 0.3);
  g.add(leaf2);
  g.scale.setScalar(scale);
  return g;
}

export function buildBase(teamColor: string, teamLight: string, shape: string): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.5, 32), toon(teamLight));
  pad.position.y = 0.2;
  g.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.22, 8, 40), toon(teamColor));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.48;
  g.add(ring);
  // Two posts and a banner with the team shape, readable without color.
  g.add(box(teamColor, 0.4, 4.2, 0.4, -2.6, 2.3, -2.6));
  g.add(box(teamColor, 0.4, 4.2, 0.4, 2.6, 2.3, -2.6));
  g.add(box(teamLight, 5.6, 1.1, 0.25, 0, 4.0, -2.6));
  const emblemGeo = shape === "sun" ? new THREE.CylinderGeometry(0.55, 0.55, 0.3, 8) : new THREE.TorusGeometry(0.42, 0.18, 6, 16, Math.PI * 1.3);
  const emblem = new THREE.Mesh(emblemGeo, toon(teamColor));
  if (shape === "sun") emblem.rotation.x = Math.PI / 2;
  emblem.position.set(0, 4.0, -2.4);
  g.add(emblem);
  return g;
}

/** A short post with a team pennant, set where a bridge lands in a homeland. */
export function buildBorderPost(teamColor: string, teamLight: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box("#f4f1e8", 0.3, 3, 0.3, 0, 1.5, 0));
  g.add(box(teamColor, 0.08, 0.7, 1.1, 0, 2.55, 0.55));
  g.add(box(teamLight, 0.5, 0.3, 0.5, 0, 3.1, 0));
  return g;
}
