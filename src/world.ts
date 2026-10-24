/**
 * Island scenery: ground, sea, sky, trees, bridges, border posts, bases and
 * power up stations. Built for one map; rebuilt when the team size changes.
 */
import * as THREE from "three";
import { RAMP, buildBase, buildBorderPost, buildStation, treeParts } from "./models";
import { TEAMS } from "./palette";
import { mulberry32 } from "./rng";
import type { Match } from "./sim";
import type { WorldDef, WorldPalette } from "./worlds";
import { BRIDGES, WATER_Y, WORLD_HALF_X, WORLD_HALF_Z, ZONE_EDGE, groundHeight, landOf, mapScale, onBridge } from "./terrain";

export interface World {
  /** `cam` is where the camera is, so snow, rain and embers fall around you. */
  update(t: number, m: Match, cam?: THREE.Vector3): void;
  /** Light up the sky for a moment, as lightning lands. */
  flash(): void;
  /** Take everything back out of the scene. */
  dispose(): void;
}

export function buildWorld(scene: THREE.Scene, match: Match): World {
  const def = match.world;
  const P = def.palette;
  const group = new THREE.Group();
  scene.add(group);
  scene.background = skyTexture(P);
  scene.fog = new THREE.Fog(P.fog, def.fogNear, def.fogFar);

  // A strong sky fill and a gentler sun keep the shading soft and friendly.
  const hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, 1.85);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(P.sun, 1.9);
  sun.position.set(-40, 80, 30);
  group.add(sun);
  const back = new THREE.DirectionalLight(P.skyHorizon, 0.45);
  back.position.set(40, 30, -60);
  group.add(back);

  const ground = buildGround(P);
  group.add(ground);

  const waterGeo = new THREE.PlaneGeometry(WORLD_HALF_X * 2 + 600, WORLD_HALF_Z * 2 + 600, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const lava = def.liquid === "lava";
  const water = new THREE.Mesh(
    waterGeo,
    lava
      ? new THREE.MeshToonMaterial({ color: P.waterShallow, gradientMap: RAMP, emissive: P.waterDeep, emissiveIntensity: 0.7 })
      : new THREE.MeshToonMaterial({ color: P.waterShallow, gradientMap: RAMP, transparent: true, opacity: 0.74 }),
  );
  water.position.y = WATER_Y;
  group.add(water);

  // Trees grow with the island, drawn as one instanced batch per part.
  const rng = mulberry32(7);
  const s = mapScale();
  const want = Math.min(700, Math.round(90 * def.trees * ((WORLD_HALF_X * WORLD_HALF_Z) / (60 * 137))));
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
  group.add(buildFlowersAndRocks(match, rng, def));
  group.add(buildProps(match, rng, def));
  const clouds = buildClouds(rng, def);
  group.add(clouds.mesh);
  const weather = buildWeather(def);
  if (weather) group.add(weather.points);
  for (const part of treeParts(def.tree, P.trunk, P.leaf, P.leafLight)) {
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
  const shallow = new THREE.Color(P.waterShallow);
  const deep = new THREE.Color(P.waterDeep);
  const hemiBase = hemi.intensity;
  let flashT = 0;
  let lastT = 0;
  return {
    flash() {
      flashT = 0.35;
    },
    update(t: number, m: Match, cam?: THREE.Vector3) {
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      water.position.y = WATER_Y + Math.sin(t * 0.9) * 0.05;
      clouds.update(t);
      if (weather && cam) weather.update(dt, cam);
      flashT = Math.max(0, flashT - dt);
      hemi.intensity = hemiBase + flashT * 6;
      if (lava) waterMat.emissiveIntensity = 0.6 + 0.25 * Math.sin(t * 1.7) + 0.1 * Math.sin(t * 4.3);
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

function buildGround(P: WorldPalette): THREE.Mesh {
  const w = WORLD_HALF_X * 2 + 30;
  const l = WORLD_HALF_Z * 2 + 30;
  // About a meter per square on Home Isle; coarser on the giants so the
  // ground stays one cheap mesh (the toon look hides the difference).
  const cell = Math.max(1, Math.sqrt((w * l) / 90000));
  const geo = new THREE.PlaneGeometry(w, l, Math.round(w / cell), Math.round(l / cell));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(P.sand);
  const grassLow = new THREE.Color(P.grassLow);
  const grassHigh = new THREE.Color(P.grassHigh);
  const rock = new THREE.Color(P.rock);
  const plank = new THREE.Color("#c99a68");
  const seabed = new THREE.Color(P.seabed);
  const foam = new THREE.Color(P.foam);
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

function skyTexture(P: WorldPalette): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, P.skyTop);
  grad.addColorStop(0.65, P.skyHorizon);
  grad.addColorStop(1, P.skyHorizon);
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

function buildClouds(rng: () => number, def: WorldDef): Clouds {
  const puffs: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; speed: number }> = [];
  const count = Math.min(40, Math.round(10 + (WORLD_HALF_X * WORLD_HALF_Z) / 2500));
  for (let i = 0; i < count; i++) {
    const cx = (rng() - 0.5) * 2 * (WORLD_HALF_X + 120);
    const cy = 38 + rng() * 22;
    const cz = (rng() - 0.5) * 2 * (WORLD_HALF_Z + 60);
    const speed = (0.6 + rng() * 0.9) * (def.storm ? 4 : 1);
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const r = 3 + rng() * 3;
      puffs.push({ x: cx + (k - n / 2) * 3.4 + rng() * 1.5, y: cy + rng() * 1.5, z: cz + rng() * 2.5, sx: r * 1.3, sy: r * 0.75, sz: r, speed });
    }
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshToonMaterial({ color: def.storm ? "#9aa3bd" : def.liquid === "lava" ? "#6f5560" : "#ffffff", gradientMap: RAMP, fog: false }),
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
function buildFlowersAndRocks(match: Match, rng: () => number, def: WorldDef): THREE.Group {
  const g = new THREE.Group();
  const clear = (x: number, z: number) =>
    !onBridge(x, z) &&
    !match.bases.some((b) => Math.hypot(b.x - x, b.z - z) < match.baseRadius + 2) &&
    !match.stations.some((st) => Math.hypot(st.x - x, st.z - z) < 3);
  const area = (WORLD_HALF_X * WORLD_HALF_Z) / (60 * 137);
  const petals = def.petals.length ? def.petals : ["#ffffff"];
  const flowerGeo = new THREE.IcosahedronGeometry(0.17, 0);
  const flowerSpots: Array<[number, number, number, number]> = [];
  const wantFlowers = Math.min(2400, Math.round(700 * area * def.flowers));
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
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshToonMaterial({ color: def.palette.rock, gradientMap: RAMP }), Math.max(1, rockSpots.length));
  rockSpots.forEach((mtx, i) => rocks.setMatrixAt(i, mtx));
  rocks.count = rockSpots.length;
  rocks.computeBoundingSphere();
  g.add(rocks);
  return g;
}

/**
 * Each world's own details: coral and starfish in tropical shallows, ice
 * floes on the cold sea, crystals round the storm spire, bleached bones on
 * the dunes and glowing rocks along the lava.
 */
function buildProps(match: Match, rng: () => number, def: WorldDef): THREE.Group {
  const g = new THREE.Group();
  const area = (WORLD_HALF_X * WORLD_HALF_Z) / (60 * 137);
  const clear = (x: number, z: number) =>
    !onBridge(x, z) &&
    !match.bases.some((b) => Math.hypot(b.x - x, b.z - z) < match.baseRadius + 2) &&
    !match.stations.some((st) => Math.hypot(st.x - x, st.z - z) < 3);
  const scatter = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    ok: (h: number) => boolean,
    size: [number, number],
    colors?: string[],
    flat = 1,
    lift = 0,
  ) => {
    const mats: THREE.Matrix4[] = [];
    const tints: number[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < count * 14 && mats.length < count; i++) {
      const x = (rng() - 0.5) * 2 * WORLD_HALF_X;
      const z = (rng() - 0.5) * 2 * WORLD_HALF_Z;
      const h = groundHeight(x, z);
      if (!ok(h) || !clear(x, z)) continue;
      const sc = size[0] + rng() * (size[1] - size[0]);
      q.setFromEuler(e.set((rng() - 0.5) * 0.4, rng() * Math.PI * 2, (rng() - 0.5) * 0.4));
      const y = lift ? Math.max(h, WATER_Y) + lift : h;
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc * flat, sc)));
      tints.push(colors ? Math.floor(rng() * colors.length) : 0);
    }
    if (!mats.length) return;
    const inst = new THREE.InstancedMesh(geo, mat, mats.length);
    const c = new THREE.Color();
    mats.forEach((m, i) => {
      inst.setMatrixAt(i, m);
      if (colors) inst.setColorAt(i, c.set(colors[tints[i]]));
    });
    inst.computeBoundingSphere();
    g.add(inst);
  };
  const white = () => new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP });
  const n = (k: number) => Math.min(900, Math.round(k * area));
  if (def.id === "reef" || def.id === "lagoon" || def.id === "home") {
    // Coral heads and starfish in the shallows, seen through the water.
    const coral = new THREE.DodecahedronGeometry(0.6, 1);
    scatter(coral, white(), n(def.id === "home" ? 40 : 220), (h) => h < -0.3 && h > -2.2, [0.5, 1.3], ["#ff7aa8", "#ff9f6b", "#b37aff", "#ffd166", "#5fe0c8"], 0.8);
    const star = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 5);
    scatter(star, white(), n(60), (h) => h < 0.5 && h > -0.6, [0.4, 0.7], ["#ff6b5b", "#ff9f1c", "#ff7aa8"]);
  }
  if (def.id === "frost") {
    const floe = new THREE.CylinderGeometry(1, 1.15, 0.35, 7);
    scatter(floe, new THREE.MeshToonMaterial({ color: "#f4fbff", gradientMap: RAMP }), n(60), (h) => h < -1.2, [0.7, 1.8], undefined, 1, 0.05);
    const shard = new THREE.ConeGeometry(0.5, 1.6, 5);
    scatter(shard, new THREE.MeshToonMaterial({ color: "#bfe6ff", gradientMap: RAMP, emissive: "#7fc8ff", emissiveIntensity: 0.15 }), n(90), (h) => h > 1.2, [0.6, 1.4]);
  }
  if (def.id === "storm") {
    const crystal = new THREE.OctahedronGeometry(0.6, 0);
    scatter(crystal, new THREE.MeshToonMaterial({ color: "#b3a9ff", gradientMap: RAMP, emissive: "#8f7fff", emissiveIntensity: 0.35 }), n(110), (h) => h > 1.1, [0.6, 1.5], undefined, 2.2);
  }
  if (def.id === "dunes") {
    const bone = new THREE.CapsuleGeometry(0.12, 0.9, 2, 6);
    scatter(bone, new THREE.MeshToonMaterial({ color: "#fff1dc", gradientMap: RAMP }), n(70), (h) => h > 0.4, [0.7, 1.2]);
    const brush = new THREE.IcosahedronGeometry(0.5, 0);
    scatter(brush, new THREE.MeshToonMaterial({ color: "#c9a25f", gradientMap: RAMP }), n(160), (h) => h > 0.5, [0.5, 0.9], undefined, 0.7);
  }
  if (def.id === "lava") {
    // Cooling rocks with a hot glow along the lava's edge.
    const rock = new THREE.DodecahedronGeometry(0.7, 0);
    scatter(rock, new THREE.MeshToonMaterial({ color: "#3a2f36", gradientMap: RAMP, emissive: "#ff5a1f", emissiveIntensity: 0.35 }), n(260), (h) => h > -0.2 && h < 0.8, [0.6, 1.6], undefined, 0.6);
  }
  if (def.id === "bluffs") {
    const leaves = new THREE.IcosahedronGeometry(0.45, 0);
    scatter(leaves, white(), n(240), (h) => h > 1.1, [0.5, 0.9], ["#d98a3c", "#f2b45a", "#c9563c"], 0.5);
  }
  return g;
}

interface Weather {
  points: THREE.Points;
  update(dt: number, cam: THREE.Vector3): void;
}

/** Snow on Frost Floe, rain on Storm Spire, embers over the lava, dust on the dunes. */
function buildWeather(def: WorldDef): Weather | null {
  const kinds: Record<string, { color: string; size: number; fall: number; drift: number; count: number; opacity: number }> = {
    frost: { color: "#ffffff", size: 0.32, fall: -2.2, drift: 0.8, count: 900, opacity: 0.9 },
    storm: { color: "#cfd8ef", size: 0.18, fall: -22, drift: 3, count: 1100, opacity: 0.55 },
    lava: { color: "#ffb347", size: 0.22, fall: 1.6, drift: 0.6, count: 500, opacity: 0.9 },
    dunes: { color: "#ffe1b8", size: 0.16, fall: -0.2, drift: 4, count: 400, opacity: 0.55 },
  };
  const k = kinds[def.id];
  if (!k) return null;
  const R = 40;
  const H = 26;
  const pos = new Float32Array(k.count * 3);
  for (let i = 0; i < k.count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 2 * R;
    pos[i * 3 + 1] = Math.random() * H;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 2 * R;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: k.color, size: k.size, transparent: true, opacity: k.opacity, depthWrite: false, fog: def.id !== "lava" }),
  );
  points.frustumCulled = false;
  let t = 0;
  return {
    points,
    update(dt, cam) {
      t += dt;
      // The field rides along with the camera and wraps round it.
      points.position.set(cam.x, cam.y - H * 0.45, cam.z);
      const a = pos;
      for (let i = 0; i < k.count; i++) {
        let y = a[i * 3 + 1] + k.fall * dt;
        if (y < 0) y += H;
        else if (y > H) y -= H;
        a[i * 3 + 1] = y;
        a[i * 3] += Math.sin(t * 0.7 + i) * k.drift * dt;
        if (a[i * 3] > R) a[i * 3] -= 2 * R;
        else if (a[i * 3] < -R) a[i * 3] += 2 * R;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
