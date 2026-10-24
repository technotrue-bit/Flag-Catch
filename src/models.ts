/**
 * Scenery props: stations, flags, trees, bases, border posts and medic
 * gear. Every part is a toon material on the shared ramp. The animals
 * themselves live in critters.ts.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const rampCanvas = document.createElement("canvas");
rampCanvas.width = 4;
rampCanvas.height = 1;
{
  const ctx = rampCanvas.getContext("2d")!;
  // Dark to light: three.js samples the ramp at dot(N, L) * 0.5 + 0.5.
  // Four gentle steps rather than three hard ones, for softer shading.
  ["#9496b4", "#bdbed3", "#e3e3ee", "#ffffff"].forEach((c, i) => {
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

/**
 * A power up station: a short post holding a spinning gift box. The box
 * hides while the station recharges.
 */
export function buildStation(): { root: THREE.Group; box: THREE.Group } {
  const root = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.3, 20), toon("#f4f1e8"));
  pad.position.y = 0.1;
  root.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.14, 6, 28), toon("#ffd166"));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.28;
  root.add(ring);
  const boxG = new THREE.Group();
  boxG.position.y = 1.8;
  boxG.add(box("#ff6b9a", 1.1, 1.1, 1.1));
  boxG.add(box("#ffd166", 1.16, 0.22, 1.16));
  boxG.add(box("#ffd166", 0.22, 1.16, 1.16));
  boxG.add(box("#ffffff", 0.5, 0.5, 0.5, 0, 0.75, 0));
  root.add(boxG);
  return { root, box: boxG };
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

type TreePart = { geo: THREE.BufferGeometry; mat: THREE.Material; offset: THREE.Matrix4 };

/** Bake a few shapes, each placed by its own matrix, into one geometry. */
function fuse(pieces: Array<[THREE.BufferGeometry, THREE.Matrix4]>): THREE.BufferGeometry {
  const geos = pieces.map(([g, m]) => {
    const c = g.clone().applyMatrix4(m);
    for (const name of Object.keys(c.attributes)) if (name !== "position" && name !== "normal") c.deleteAttribute(name);
    return c.index ? c.toNonIndexed() : c;
  });
  return mergeGeometries(geos)!;
}

const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const ID = new THREE.Matrix4();

/**
 * Tree parts for instanced forests in each world's style: each part is one
 * shape (several fused together) drawn as one batch for the whole island.
 */
export function treeParts(style: string, trunk: string, leaf: string, leafLight: string): TreePart[] {
  const ball = new THREE.SphereGeometry(1, 10, 7);
  const tube = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  const cone = new THREE.ConeGeometry(1, 1, 9);
  switch (style) {
    case "palm": {
      // A leaning, ringed trunk under a crown of drooping fronds and coconuts.
      const trunkGeo = fuse([0, 1, 2, 3, 4].map((k) => [tube, M(k * 0.12, 0.45 + k * 0.9, 0, 0.42 - k * 0.04, 0.95, 0.42 - k * 0.04, 0, 0, -0.08 - k * 0.03)]));
      const fronds = fuse(
        [0, 1, 2, 3, 4, 5].map((k) => {
          const a = (k / 6) * Math.PI * 2;
          return [ball, M(0.62 + Math.sin(a) * 1.3, 4.5, Math.cos(a) * 1.3, 0.45, 0.12, 1.5, 0.35, a, 0)];
        }),
      );
      const nuts = fuse([0, 1, 2].map((k) => [ball, M(0.62 + Math.sin(k * 2.1) * 0.3, 4.25, Math.cos(k * 2.1) * 0.3, 0.2, 0.2, 0.2)]));
      return [
        { geo: trunkGeo, mat: toon(trunk), offset: ID },
        { geo: fronds, mat: toon(leaf), offset: ID },
        { geo: nuts, mat: toon("#7a5a3b"), offset: ID },
      ];
    }
    case "pine": {
      const tiers = fuse([0, 1, 2].map((k) => [cone, M(0, 1.6 + k * 1.05, 0, 1.6 - k * 0.42, 1.6, 1.6 - k * 0.42)]));
      const caps = fuse([0, 1, 2].map((k) => [cone, M(0, 2.05 + k * 1.05, 0, 0.75 - k * 0.2, 0.7, 0.75 - k * 0.2)]));
      return [
        { geo: tube, mat: toon(trunk), offset: M(0, 0.6, 0, 0.45, 1.2, 0.45) },
        { geo: tiers, mat: toon(leaf), offset: ID },
        { geo: caps, mat: toon(leafLight), offset: ID },
      ];
    }
    case "cactus": {
      const cap = new THREE.CapsuleGeometry(0.4, 1, 3, 8);
      const body = fuse([
        [cap, M(0, 1.3, 0, 1, 1.6, 1)],
        [cap, M(0.62, 1.55, 0, 0.6, 0.5, 0.6)],
        [cap, M(0.82, 2.05, 0, 0.6, 0.6, 0.6)],
        [cap, M(-0.6, 1.25, 0, 0.55, 0.45, 0.55)],
        [cap, M(-0.78, 1.7, 0, 0.55, 0.55, 0.55)],
      ]);
      return [
        { geo: body, mat: toon(leaf), offset: ID },
        { geo: ball, mat: toon("#ff6b9a"), offset: M(0, 2.6, 0, 0.22, 0.16, 0.22) },
      ];
    }
    case "dead": {
      // Bare black branches with glowing tips, for the lava world.
      const branches = fuse([
        [tube, M(0, 1.2, 0, 0.4, 2.4, 0.4)],
        [tube, M(0.45, 2.3, 0, 0.18, 1.2, 0.18, 0, 0, -0.8)],
        [tube, M(-0.4, 2.0, 0.1, 0.16, 1.0, 0.16, 0.2, 0, 0.9)],
        [tube, M(0.1, 2.7, -0.3, 0.14, 0.9, 0.14, -0.6, 0, 0)],
      ]);
      const tips = fuse([
        [ball, M(0.9, 2.65, 0, 0.13, 0.13, 0.13)],
        [ball, M(-0.78, 2.3, 0.1, 0.12, 0.12, 0.12)],
        [ball, M(0.1, 3.05, -0.55, 0.12, 0.12, 0.12)],
      ]);
      return [
        { geo: branches, mat: toon(trunk), offset: ID },
        { geo: tips, mat: new THREE.MeshBasicMaterial({ color: "#ffb347" }), offset: ID },
      ];
    }
    default: {
      // Round, soft trees: a trunk and a cluster of leaf balls.
      const crown = fuse([
        [ball, M(0, 2.9, 0, 1.5, 1.35, 1.5)],
        [ball, M(0.85, 2.6, 0.3, 0.95, 0.9, 0.95)],
        [ball, M(-0.7, 2.7, -0.4, 1.0, 0.9, 1.0)],
      ]);
      const top = fuse([[ball, M(0.35, 3.75, 0.25, 0.85, 0.75, 0.85)]]);
      return [
        { geo: tube, mat: toon(trunk), offset: M(0, 1.1, 0, 0.5, 2.2, 0.5) },
        { geo: crown, mat: toon(leaf), offset: ID },
        { geo: top, mat: toon(leafLight), offset: ID },
      ];
    }
  }
}

export function buildBase(teamColor: string, teamLight: string, shape: string, radius = 4.2): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.4, 0.5, 32), toon(teamLight));
  pad.position.y = 0.2;
  g.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.22, 8, 40), toon(teamColor));
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

/** A white cross on a red disc, worn over a medic's head. */
export function buildMedicBadge(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), toon("#e8455b"));
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  g.add(box("#ffffff", 0.5, 0.15, 0.16, 0, 0, 0.02));
  g.add(box("#ffffff", 0.15, 0.5, 0.16, 0, 0, 0.02));
  return g;
}

/** A medic's respawn flag: a tall white pole, a team pennant and a cross. */
export function buildRespawnFlag(teamColor: string): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.2, 16), toon("#f4f1e8"));
  pad.position.y = 0.08;
  g.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.1, 6, 24), toon(teamColor));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  g.add(ring);
  const pole = new THREE.Mesh(cylGeo, toon("#f4f1e8"));
  pole.scale.set(0.12, 3.4, 0.12);
  pole.position.y = 1.7;
  g.add(pole);
  g.add(box(teamColor, 1.2, 0.8, 0.08, 0.62, 3.0, 0));
  g.add(box("#ffffff", 0.5, 0.14, 0.1, 0.62, 3.0, 0));
  g.add(box("#ffffff", 0.14, 0.5, 0.1, 0.62, 3.0, 0));
  return g;
}
