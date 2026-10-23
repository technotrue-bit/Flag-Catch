/** Home Isle scenery: ground, sea, sky, trees, bridges, border posts and the two bases. */
import * as THREE from "three";
import { RAMP, buildBase, buildBorderPost, buildTree } from "./models";
import { PALETTE, TEAMS } from "./palette";
import { mulberry32 } from "./rng";
import type { Base } from "./sim";
import { BRIDGE_X, WATER_Y, WORLD_HALF_X, WORLD_HALF_Z, ZONE_EDGE, groundHeight, landOf, onBridge } from "./terrain";

export interface World {
  water: THREE.Mesh;
  update(t: number): void;
}

export function buildWorld(scene: THREE.Scene, bases: readonly Base[]): World {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(PALETTE.fog, 80, 220);

  const hemi = new THREE.HemisphereLight("#ffffff", "#9fd3a8", 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff6e6", 2.2);
  sun.position.set(-40, 80, 30);
  scene.add(sun);

  scene.add(buildGround());

  const waterGeo = new THREE.PlaneGeometry(600, 600, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshToonMaterial({ color: PALETTE.waterShallow, gradientMap: RAMP, transparent: true, opacity: 0.82 }),
  );
  water.position.y = WATER_Y;
  scene.add(water);

  const rng = mulberry32(7);
  let placed = 0;
  for (let i = 0; i < 1200 && placed < 90; i++) {
    const x = (rng() - 0.5) * 2 * WORLD_HALF_X;
    const z = (rng() - 0.5) * 2 * WORLD_HALF_Z;
    const h = groundHeight(x, z);
    if (h < 1.2 || onBridge(x, z)) continue;
    if (bases.some((b) => Math.hypot(b.x - x, b.z - z) < 10)) continue;
    // Keep the bridge mouths open.
    if (Math.abs(Math.abs(z) - ZONE_EDGE) < 16 && Math.abs(Math.abs(x) - BRIDGE_X) < 6) continue;
    const t = buildTree(0.7 + rng() * 0.6);
    t.position.set(x, h - 0.2, z);
    t.rotation.y = rng() * Math.PI * 2;
    scene.add(t);
    placed++;
  }

  // Border posts where each bridge lands in a homeland, in that team's colors.
  for (const team of [0, 1] as const) {
    const t = TEAMS[team];
    const zs = team === 0 ? 1 : -1;
    for (const bx of [-BRIDGE_X, BRIDGE_X]) {
      for (const side of [-1, 1]) {
        const x = bx + side * 4.6;
        const z = zs * (ZONE_EDGE + 10);
        const post = buildBorderPost(t.color, t.light);
        post.position.set(x, Math.max(groundHeight(x, z), WATER_Y) - 0.1, z);
        post.rotation.y = side > 0 ? Math.PI : 0;
        scene.add(post);
      }
    }
  }

  bases.forEach((b) => {
    const team = TEAMS[b.team];
    const g = buildBase(team.color, team.light, team.shape);
    g.position.set(b.x, Math.max(groundHeight(b.x, b.z), WATER_Y), b.z);
    // Face the banner toward the island's middle.
    g.rotation.y = Math.atan2(-b.x, -b.z) + Math.PI;
    scene.add(g);
  });

  const waterMat = water.material as THREE.MeshToonMaterial;
  const shallow = new THREE.Color(PALETTE.waterShallow);
  const deep = new THREE.Color(PALETTE.waterDeep);
  return {
    water,
    update(t: number) {
      water.position.y = WATER_Y + Math.sin(t * 0.9) * 0.05;
      waterMat.color.copy(shallow).lerp(deep, 0.25 + 0.1 * Math.sin(t * 0.5));
    },
  };
}

function buildGround(): THREE.Mesh {
  const w = WORLD_HALF_X * 2 + 30;
  const l = WORLD_HALF_Z * 2 + 30;
  const geo = new THREE.PlaneGeometry(w, l, Math.round(w), Math.round(l));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(PALETTE.sand);
  const grassLow = new THREE.Color(PALETTE.grassLow);
  const grassHigh = new THREE.Color(PALETTE.grassHigh);
  const rock = new THREE.Color(PALETTE.rock);
  const plank = new THREE.Color("#c99a68");
  const tints = TEAMS.map((t) => new THREE.Color(t.light));
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const slope = Math.abs(groundHeight(x + 0.6, z) - h) + Math.abs(groundHeight(x, z + 0.6) - h);
    if (onBridge(x, z)) {
      // Planks across the channel, with a dark gap every meter.
      c.copy(plank);
      if (Math.abs(z) % 1.2 < 0.25) c.multiplyScalar(0.82);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      continue;
    }
    if (h < 0.9) c.copy(sand);
    else if (slope > 0.75) c.copy(rock);
    else c.copy(grassLow).lerp(grassHigh, Math.min(1, (h - 0.9) / 5));
    // A soft checker on the grass gives a sense of speed, like a lawn.
    if (h >= 0.9 && slope <= 0.75 && (Math.floor(x / 4) + Math.floor(z / 4)) % 2 === 0) c.multiplyScalar(0.94);
    // Each homeland's ground leans a little toward its team's color.
    const land = landOf(z);
    if (land >= 0 && h > 0) c.lerp(tints[land], 0.14);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP }));
}

function skyTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.65, PALETTE.skyHorizon);
  grad.addColorStop(1, PALETTE.skyHorizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
