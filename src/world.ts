/**
 * Island scenery: ground, sea, sky, trees, bridges, border posts, bases and
 * power up stations. Built for one map; rebuilt when the team size changes.
 */
import * as THREE from "three";
import { RAMP, buildBase, buildBorderPost, buildStation, treeParts } from "./models";
import { PALETTE, TEAMS } from "./palette";
import { mulberry32 } from "./rng";
import type { Match } from "./sim";
import { BRIDGES, WATER_Y, WORLD_HALF_X, WORLD_HALF_Z, ZONE_EDGE, groundHeight, landOf, mapScale, onBridge } from "./terrain";

export interface World {
  update(t: number, m: Match): void;
  /** Take everything back out of the scene. */
  dispose(): void;
}

export function buildWorld(scene: THREE.Scene, match: Match): World {
  const group = new THREE.Group();
  scene.add(group);
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(PALETTE.fog, 80, 220);

  const hemi = new THREE.HemisphereLight("#ffffff", "#9fd3a8", 1.6);
  group.add(hemi);
  const sun = new THREE.DirectionalLight("#fff6e6", 2.2);
  sun.position.set(-40, 80, 30);
  group.add(sun);

  const ground = buildGround();
  group.add(ground);

  const waterGeo = new THREE.PlaneGeometry(WORLD_HALF_X * 2 + 600, WORLD_HALF_Z * 2 + 600, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshToonMaterial({ color: PALETTE.waterShallow, gradientMap: RAMP, transparent: true, opacity: 0.74 }),
  );
  water.position.y = WATER_Y;
  group.add(water);

  // Trees grow with the island, drawn as one instanced batch per part.
  const rng = mulberry32(7);
  const s = mapScale();
  const want = Math.min(700, Math.round(90 * ((WORLD_HALF_X * WORLD_HALF_Z) / (60 * 137))));
  const spots: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < want * 14 && spots.length < want; i++) {
    const x = (rng() - 0.5) * 2 * WORLD_HALF_X;
    const z = (rng() - 0.5) * 2 * WORLD_HALF_Z;
    const h = groundHeight(x, z);
    if (h < 1.2 || onBridge(x, z)) continue;
    if (match.bases.some((b) => Math.hypot(b.x - x, b.z - z) < match.baseRadius + 6)) continue;
    if (match.stations.some((st) => Math.hypot(st.x - x, st.z - z) < 6)) continue;
    // Keep the bridge mouths open.
    if (Math.abs(Math.abs(z) - ZONE_EDGE) < 16 * s && BRIDGES.some((bx) => Math.abs(x - bx) < 7)) continue;
    const scale = 0.7 + rng() * 0.6;
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    spots.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.2, z), q, new THREE.Vector3(scale, scale, scale)));
  }
  const tmp = new THREE.Matrix4();
  group.add(buildFlowersAndRocks(match, rng));
  const clouds = buildClouds(rng);
  group.add(clouds.mesh);
  for (const part of treeParts()) {
    const inst = new THREE.InstancedMesh(part.geo, part.mat, Math.max(1, spots.length));
    inst.count = spots.length;
    spots.forEach((mtx, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(mtx, part.offset)));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  }

  // Border posts where each bridge lands in a homeland, in that team's colors.
  for (const team of [0, 1] as const) {
    const t = TEAMS[team];
    const zs = team === 0 ? 1 : -1;
    for (const bx of BRIDGES) {
      for (const side of [-1, 1]) {
        const x = bx + side * 4.6;
        const z = zs * (ZONE_EDGE + 10 * s);
        const post = buildBorderPost(t.color, t.light);
        post.position.set(x, Math.max(groundHeight(x, z), WATER_Y) - 0.1, z);
        post.rotation.y = side > 0 ? Math.PI : 0;
        group.add(post);
      }
    }
  }

  for (const b of match.bases) {
    const team = TEAMS[b.team];
    const g = buildBase(team.color, team.light, team.shape, match.baseRadius);
    // Outposts wear a shorter banner so the main base stands out.
    if (!b.main) g.scale.set(1, 0.7, 1);
    g.position.set(b.x, Math.max(groundHeight(b.x, b.z), WATER_Y), b.z);
    // Face the banner toward the island's middle.
    g.rotation.y = Math.atan2(-b.x, -b.z) + Math.PI;
    group.add(g);
  }

  const stations = match.stations.map((st) => {
    const v = buildStation();
    v.root.position.set(st.x, Math.max(groundHeight(st.x, st.z), WATER_Y), st.z);
    group.add(v.root);
    return v;
  });

  const waterMat = water.material as THREE.MeshToonMaterial;
  const shallow = new THREE.Color(PALETTE.waterShallow);
  const deep = new THREE.Color(PALETTE.waterDeep);
  return {
    update(t: number, m: Match) {
      water.position.y = WATER_Y + Math.sin(t * 0.9) * 0.05;
      clouds.update(t);
      waterMat.color.copy(shallow).lerp(deep, 0.25 + 0.1 * Math.sin(t * 0.5));
      m.stations.forEach((st, i) => {
        const v = stations[i];
        if (!v) return;
        // The gift box is gone while the station recharges.
        v.box.visible = st.cd <= 0;
        v.box.rotation.y = t * 1.8 + i;
        v.box.position.y = 1.8 + Math.sin(t * 2.4 + i) * 0.25;
      });
    },
    dispose() {
      scene.remove(group);
      ground.geometry.dispose();
      waterGeo.dispose();
    },
  };
}

function buildGround(): THREE.Mesh {
  const w = WORLD_HALF_X * 2 + 30;
  const l = WORLD_HALF_Z * 2 + 30;
  // About a meter per square on Home Isle; coarser on the giants so the
  // ground stays one cheap mesh (the toon look hides the difference).
  const cell = Math.max(1, Math.sqrt((w * l) / 90000));
  const geo = new THREE.PlaneGeometry(w, l, Math.round(w / cell), Math.round(l / cell));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(PALETTE.sand);
  const grassLow = new THREE.Color(PALETTE.grassLow);
  const grassHigh = new THREE.Color(PALETTE.grassHigh);
  const rock = new THREE.Color(PALETTE.rock);
  const plank = new THREE.Color("#c99a68");
  const seabed = new THREE.Color(PALETTE.seabed);
  const foam = new THREE.Color(PALETTE.foam);
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
    if (h < -0.2) {
      // The sea floor darkens with depth, so the water reads deep or shallow.
      c.copy(sand).lerp(seabed, Math.min(1, (-h - 0.2) / 2.5));
    } else if (h < 0.22) c.copy(sand).lerp(foam, 0.55 * (1 - Math.abs(h) / 0.22));
    else if (h < 0.9) c.copy(sand);
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

/** Puffy low poly clouds in one instanced batch, kept crisp white instead of fading into the fog. */
interface Clouds {
  mesh: THREE.InstancedMesh;
  update(t: number): void;
}

function buildClouds(rng: () => number): Clouds {
  const puffs: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; speed: number }> = [];
  const count = Math.min(40, Math.round(10 + (WORLD_HALF_X * WORLD_HALF_Z) / 2500));
  for (let i = 0; i < count; i++) {
    const cx = (rng() - 0.5) * 2 * (WORLD_HALF_X + 120);
    const cy = 38 + rng() * 22;
    const cz = (rng() - 0.5) * 2 * (WORLD_HALF_Z + 60);
    const speed = 0.6 + rng() * 0.9;
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const r = 3 + rng() * 3;
      puffs.push({ x: cx + (k - n / 2) * 3.4 + rng() * 1.5, y: cy + rng() * 1.5, z: cz + rng() * 2.5, sx: r * 1.3, sy: r * 0.75, sz: r, speed });
    }
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP, fog: false }),
    puffs.length,
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const span = WORLD_HALF_X + 160;
  return {
    mesh,
    update(t: number) {
      puffs.forEach((p, i) => {
        // Drift across the island and wrap around the far side.
        const x = ((((p.x + t * p.speed + span) % (span * 2)) + span * 2) % (span * 2)) - span;
        mesh.setMatrixAt(i, m.compose(pos.set(x, p.y, p.z), q, scale.set(p.sx, p.sy, p.sz)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Flower patches on the grass and small rocks on the beaches, as two instanced batches. */
function buildFlowersAndRocks(match: Match, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const clear = (x: number, z: number) =>
    !onBridge(x, z) &&
    !match.bases.some((b) => Math.hypot(b.x - x, b.z - z) < match.baseRadius + 2) &&
    !match.stations.some((st) => Math.hypot(st.x - x, st.z - z) < 3);
  const area = (WORLD_HALF_X * WORLD_HALF_Z) / (60 * 137);
  const petals = ["#ff8fb1", "#ffd166", "#ffffff", "#b3a9ff", "#ff9f6b"];
  const flowerGeo = new THREE.IcosahedronGeometry(0.17, 0);
  const flowerSpots: Array<[number, number, number, number]> = [];
  const wantFlowers = Math.min(2400, Math.round(700 * area));
  for (let i = 0; i < wantFlowers * 4 && flowerSpots.length < wantFlowers; ) {
    // Patches of a few flowers of one color.
    const cx = (rng() - 0.5) * 2 * WORLD_HALF_X;
    const cz = (rng() - 0.5) * 2 * WORLD_HALF_Z;
    const color = Math.floor(rng() * petals.length);
    const n = 3 + Math.floor(rng() * 5);
    for (let k = 0; k < n; k++, i++) {
      const x = cx + (rng() - 0.5) * 2.4;
      const z = cz + (rng() - 0.5) * 2.4;
      const h = groundHeight(x, z);
      if (h < 1.1 || !clear(x, z)) continue;
      flowerSpots.push([x, h + 0.12, z, color]);
    }
  }
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP }), Math.max(1, flowerSpots.length));
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  flowerSpots.forEach(([x, y, z, ci], i) => {
    m.makeTranslation(x, y, z);
    flowers.setMatrixAt(i, m);
    flowers.setColorAt(i, col.set(petals[ci]));
  });
  flowers.count = flowerSpots.length;
  flowers.computeBoundingSphere();
  g.add(flowers);

  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const rockSpots: THREE.Matrix4[] = [];
  const wantRocks = Math.min(500, Math.round(120 * area));
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < wantRocks * 12 && rockSpots.length < wantRocks; i++) {
    const x = (rng() - 0.5) * 2 * WORLD_HALF_X;
    const z = (rng() - 0.5) * 2 * WORLD_HALF_Z;
    const h = groundHeight(x, z);
    // Mostly on the sand and the shallows, some on the hills.
    if (h < -0.6 || (h > 1.1 && rng() > 0.25) || !clear(x, z)) continue;
    const sc = 0.4 + rng() * 0.8;
    q.setFromEuler(e.set(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
    rockSpots.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.08, z), q, new THREE.Vector3(sc * 1.2, sc * 0.6, sc)));
  }
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshToonMaterial({ color: PALETTE.rock, gradientMap: RAMP }), Math.max(1, rockSpots.length));
  rockSpots.forEach((mtx, i) => rocks.setMatrixAt(i, mtx));
  rocks.count = rockSpots.length;
  rocks.computeBoundingSphere();
  g.add(rocks);
  return g;
}
