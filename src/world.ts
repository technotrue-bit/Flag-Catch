/** Home Isle scenery: ground, sea, sky, trees and the two bases. */
import * as THREE from "three";
import { RAMP, buildBase, buildTree } from "./models";
import { PALETTE, TEAMS } from "./palette";
import { mulberry32 } from "./rng";
import type { Base } from "./sim";
import { WATER_Y, groundHeight } from "./terrain";

export interface World {
  water: THREE.Mesh;
  update(t: number): void;
}

export function buildWorld(scene: THREE.Scene, bases: readonly Base[]): World {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(PALETTE.fog, 70, 190);

  const hemi = new THREE.HemisphereLight("#ffffff", "#9fd3a8", 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff6e6", 2.2);
  sun.position.set(-40, 80, 30);
  scene.add(sun);

  scene.add(buildGround());

  const waterGeo = new THREE.PlaneGeometry(420, 420, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshToonMaterial({ color: PALETTE.waterShallow, gradientMap: RAMP, transparent: true, opacity: 0.82 }),
  );
  water.position.y = WATER_Y;
  scene.add(water);

  const rng = mulberry32(7);
  let placed = 0;
  for (let i = 0; i < 400 && placed < 46; i++) {
    const x = (rng() - 0.5) * 120;
    const z = (rng() - 0.5) * 120;
    const h = groundHeight(x, z);
    if (h < 1.2) continue;
    if (bases.some((b) => Math.hypot(b.x - x, b.z - z) < 9)) continue;
    if (Math.hypot(x, z) < 6) continue;
    const t = buildTree(0.7 + rng() * 0.6);
    t.position.set(x, h - 0.2, z);
    t.rotation.y = rng() * Math.PI * 2;
    scene.add(t);
    placed++;
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
  const size = 170;
  const seg = 150;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(PALETTE.sand);
  const grassLow = new THREE.Color(PALETTE.grassLow);
  const grassHigh = new THREE.Color(PALETTE.grassHigh);
  const rock = new THREE.Color(PALETTE.rock);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const slope = Math.abs(groundHeight(x + 0.6, z) - h) + Math.abs(groundHeight(x, z + 0.6) - h);
    if (h < 0.9) c.copy(sand);
    else if (slope > 0.75) c.copy(rock);
    else c.copy(grassLow).lerp(grassHigh, Math.min(1, (h - 0.9) / 5));
    // A soft checker on the grass gives a sense of speed, like a lawn.
    if (h >= 0.9 && slope <= 0.75 && (Math.floor(x / 4) + Math.floor(z / 4)) % 2 === 0) c.multiplyScalar(0.94);
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
