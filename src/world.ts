/**
 * Island scenery: ground, sea, sky, trees, bridges, border posts, bases and
 * power up stations. Built for one map; rebuilt when the team size changes.
 */
import * as THREE from "three";
import { RAMP, buildBase, buildBorderPost, buildStation, sharedShape, treeParts } from "./models";
import { TEAMS } from "./palette";
import { mulberry32 } from "./rng";
import type { Match } from "./sim";
import type { WorldDef, WorldPalette } from "./worlds";
import { BRIDGES, WATER_Y, WORLD_HALF_X, WORLD_HALF_Z, ZONE_EDGE, groundHeight, landOf, mapScale, onBridge } from "./terrain";
import { type Scenery, sceneryFor } from "./look";

export interface World {
  /**
   * `cam` is where the camera is, so snow, rain and embers fall around you.
   * `focus` is your animal: trees between it and the camera turn see-through,
   * and the sun's shadows are drawn around it.
   */
  update(t: number, m: Match, cam?: THREE.Vector3, focus?: THREE.Vector3): void;
  /** Light up the sky for a moment, as lightning lands. */
  flash(): void;
  /** Take everything back out of the scene. */
  dispose(): void;
}

/** Where the sun shines from. */
const SUN_DIR = new THREE.Vector3(-40, 80, 30).normalize();

export function buildWorld(scene: THREE.Scene, match: Match, look: Scenery = sceneryFor("normal"), renderer?: THREE.WebGLRenderer): World {
  const def = match.world;
  const P = def.palette;
  const group = new THREE.Group();
  scene.add(group);
  scene.background = skyTexture(P);
  scene.fog = new THREE.Fog(P.fog, def.fogNear, def.fogFar);
  const owned: Array<{ dispose(): void }> = [];

  // A strong sky fill and a gentler sun keep the shading soft and friendly.
  // With shadows on, the sun takes a bigger share so the shade reads.
  const hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, look.shadows ? 1.45 : 1.85);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(P.sun, look.shadows ? 2.5 : 1.9);
  sun.position.copy(SUN_DIR).multiplyScalar(100);
  group.add(sun);
  group.add(sun.target);
  if (look.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const box = sun.shadow.camera;
    box.left = box.bottom = -SHADOW_REACH;
    box.right = box.top = SHADOW_REACH;
    box.near = 1;
    box.far = 240;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.07;
    sun.shadow.radius = 3;
  }
  const back = new THREE.DirectionalLight(P.skyHorizon, 0.45);
  back.position.set(40, 30, -60);
  group.add(back);

  const ground = buildGround(P, look);
  ground.receiveShadow = look.shadows;
  group.add(ground);

  const sky = look.skyDome ? buildSkyDome(P) : null;
  if (sky) {
    group.add(sky);
    owned.push(sky.geometry, sky.material as THREE.Material);
  }

  const waterGeo = new THREE.PlaneGeometry(WORLD_HALF_X * 2 + 600, WORLD_HALF_Z * 2 + 600, 1, 1);
  waterGeo.rotateX(-Math.PI / 2);
  const lava = def.liquid === "lava";
  const rich = look.richWater ? richLiquid(P, lava, waterGeo, renderer) : null;
  if (rich) owned.push(rich);
  const water = new THREE.Mesh(
    waterGeo,
    rich
      ? rich.material
      : lava
        ? new THREE.MeshToonMaterial({ color: P.waterShallow, gradientMap: RAMP, emissive: P.waterDeep, emissiveIntensity: 0.7 })
        : new THREE.MeshToonMaterial({ color: P.waterShallow, gradientMap: RAMP, transparent: true, opacity: 0.74 }),
  );
  water.position.y = WATER_Y;
  water.receiveShadow = look.shadows && !lava;
  group.add(water);

  // Trees grow with the island, drawn as one instanced batch per part.
  const rng = mulberry32(7);
  const s = mapScale();
  const want = Math.min(Math.round(700 * look.density), Math.round(90 * def.trees * look.density * ((WORLD_HALF_X * WORLD_HALF_Z) / (60 * 137))));
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
  /** Tall single pieces (base banners) that fade like the trees, worked out here rather than on the GPU. */
  const faders: Array<{ at: THREE.Vector3; mat: THREE.MeshToonMaterial }> = [];
  group.add(buildFlowersAndRocks(match, rng, def, look));
  group.add(buildProps(match, rng, def, look));
  const clouds = buildClouds(rng, def);
  group.add(clouds.mesh);
  const weather = buildWeather(def, look);
  if (weather) group.add(weather.points);
  const grass = look.grass && GRASSY.has(def.id) ? buildGrass(match, rng, P) : null;
  if (grass) group.add(grass.group);
  // Each tree part is drawn twice from the same placements: solid, and as a
  // see-through ghost for the trees standing between the camera and you.
  for (const part of treeParts(def.tree, P.trunk, P.leaf, P.leafLight, look.smooth)) {
    for (const ghost of [false, true]) {
      const mat = seeThrough(part.mat, ghost);
      owned.push(mat);
      const inst = new THREE.InstancedMesh(part.geo, mat, Math.max(1, spots.length));
      inst.count = spots.length;
      spots.forEach((mtx, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(mtx, part.offset)));
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = !ghost;
      // The ghosts draw after the solid scene, so what's behind shows through.
      if (ghost) inst.renderOrder = 2;
      group.add(inst);
    }
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
        shade(post, look);
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
    shade(g, look);
    group.add(g);
    // The posts and banner stand tall over the base; they fade like trees
    // when the camera looks past them at you.
    g.updateMatrixWorld(true);
    for (const part of g.children) {
      const mesh = part as THREE.Mesh;
      if (mesh.position.y < 1.5) continue;
      const mat = (mesh.material as THREE.MeshToonMaterial).clone();
      mat.transparent = true;
      owned.push(mat);
      mesh.material = mat;
      faders.push({ at: mesh.getWorldPosition(new THREE.Vector3()), mat });
    }
  }

  const stations = match.stations.map((st) => {
    const v = buildStation();
    v.root.position.set(st.x, Math.max(groundHeight(st.x, st.z), WATER_Y), st.z);
    shade(v.root, look);
    group.add(v.root);
    return v;
  });

  const waterMat = water.material as THREE.MeshToonMaterial | THREE.MeshStandardMaterial;
  const shallow = new THREE.Color(P.waterShallow);
  const deep = new THREE.Color(P.waterDeep);
  const hemiBase = hemi.intensity;
  let flashT = 0;
  let lastT = 0;
  return {
    flash() {
      flashT = 0.35;
    },
    update(t: number, m: Match, cam?: THREE.Vector3, focus?: THREE.Vector3) {
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      water.position.y = WATER_Y + Math.sin(t * 0.9) * 0.05;
      clouds.update(t);
      if (weather && cam) weather.update(dt, cam);
      if (grass) grass.update(t, cam);
      rich?.update(t);
      if (sky && cam) sky.position.copy(cam);
      if (cam && focus) {
        SEE.uEye.value.copy(cam);
        SEE.uFocus.value.copy(focus);
        for (const f of faders) {
          const see = seeAmount(f.at, cam, focus);
          f.mat.opacity = 1 - 0.8 * see;
          f.mat.depthWrite = see < 0.01;
        }
      }
      if (look.shadows && focus) {
        // The shadow box rides along with you, stepped a whole shadow pixel
        // at a time so the edges don't crawl as you move.
        const texel = (SHADOW_REACH * 2) / sun.shadow.mapSize.x;
        const fx = Math.round(focus.x / texel) * texel;
        const fz = Math.round(focus.z / texel) * texel;
        sun.target.position.set(fx, 0, fz);
        sun.position.set(fx + SUN_DIR.x * 100, SUN_DIR.y * 100, fz + SUN_DIR.z * 100);
      }
      flashT = Math.max(0, flashT - dt);
      hemi.intensity = hemiBase + flashT * 6;
      if (lava) waterMat.emissiveIntensity = (rich ? 0.95 : 0.6) + 0.25 * Math.sin(t * 1.7) + 0.1 * Math.sin(t * 4.3);
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
      // Everything built for this island goes, but not the shapes all props share.
      const shapes = new Set<THREE.BufferGeometry>();
      group.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (g && !sharedShape(g)) shapes.add(g);
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      for (const g of shapes) g.dispose();
      if (scene.background instanceof THREE.Texture) scene.background.dispose();
      (ground.material as THREE.Material).dispose();
      (water.material as THREE.Material).dispose();
      ground.geometry.dispose();
      waterGeo.dispose();
      grass?.dispose();
      for (const o of owned) o.dispose();
    },
  };
}

function buildGround(P: WorldPalette, look: Scenery): THREE.Mesh {
  const w = WORLD_HALF_X * 2 + 30;
  const l = WORLD_HALF_Z * 2 + 30;
  // About a meter per square on Home Isle; coarser on the giants so the
  // ground stays one cheap mesh (the toon look hides the difference).
  const cell = Math.max(1, Math.sqrt((w * l) / 90000)) / look.groundDetail;
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
    // High graphics: soft patches of lighter and darker ground, like a real lawn or beach.
    if (look.smooth && h > -0.2) c.multiplyScalar(0.95 + 0.1 * mottle(x, z));
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
function buildFlowersAndRocks(match: Match, rng: () => number, def: WorldDef, look: Scenery): THREE.Group {
  const g = new THREE.Group();
  const clear = (x: number, z: number) =>
    !onBridge(x, z) &&
    !match.bases.some((b) => Math.hypot(b.x - x, b.z - z) < match.baseRadius + 2) &&
    !match.stations.some((st) => Math.hypot(st.x - x, st.z - z) < 3);
  const area = (WORLD_HALF_X * WORLD_HALF_Z) / (60 * 137);
  const petals = def.petals.length ? def.petals : ["#ffffff"];
  const flowerGeo = new THREE.IcosahedronGeometry(0.17, look.smooth ? 1 : 0);
  const flowerSpots: Array<[number, number, number, number]> = [];
  const wantFlowers = Math.min(Math.round(2400 * look.density), Math.round(700 * area * def.flowers * look.density));
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
  const wantRocks = Math.min(Math.round(500 * look.density), Math.round(120 * area * look.density));
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
  rocks.castShadow = rocks.receiveShadow = look.shadows;
  g.add(rocks);
  return g;
}

/**
 * Each world's own details: coral and starfish in tropical shallows, ice
 * floes on the cold sea, crystals round the storm spire, bleached bones on
 * the dunes and glowing rocks along the lava.
 */
function buildProps(match: Match, rng: () => number, def: WorldDef, look: Scenery): THREE.Group {
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
    inst.castShadow = inst.receiveShadow = look.shadows;
    g.add(inst);
  };
  const white = () => new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP });
  const n = (k: number) => Math.min(900, Math.round(k * area * look.density));
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

/** A round, soft edged dot, so snow, rain and embers aren't little squares. */
let dot: THREE.CanvasTexture | null = null;
function softDot(): THREE.CanvasTexture {
  if (dot) return dot;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  dot = new THREE.CanvasTexture(canvas);
  dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}

interface Weather {
  points: THREE.Points;
  update(dt: number, cam: THREE.Vector3): void;
}

/** Snow on Frost Floe, rain on Storm Spire, embers over the lava, dust on the dunes. */
function buildWeather(def: WorldDef, look: Scenery): Weather | null {
  const kinds: Record<string, { color: string; size: number; fall: number; drift: number; count: number; opacity: number }> = {
    frost: { color: "#ffffff", size: 0.32, fall: -2.2, drift: 0.8, count: 900, opacity: 0.9 },
    storm: { color: "#cfd8ef", size: 0.18, fall: -22, drift: 3, count: 1100, opacity: 0.55 },
    lava: { color: "#ffb347", size: 0.22, fall: 1.6, drift: 0.6, count: 500, opacity: 0.9 },
    dunes: { color: "#ffe1b8", size: 0.16, fall: -0.2, drift: 4, count: 400, opacity: 0.55 },
  };
  const base = kinds[def.id];
  if (!base) return null;
  const k = { ...base, count: Math.round(base.count * Math.min(1.3, look.density)) };
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
    new THREE.PointsMaterial({ color: k.color, size: k.size, map: softDot(), transparent: true, opacity: k.opacity, depthWrite: false, fog: def.id !== "lava" }),
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

/** Half the width of the ground the sun's shadows cover around you, in meters. */
const SHADOW_REACH = 42;

/** Things that cast and catch the sun's shadows when High graphics has them. */
function shade(root: THREE.Object3D, look: Scenery): void {
  if (!look.shadows) return;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
}

/** Soft value noise, 0 to 1, for patches of lighter and darker ground. */
function mottle(x: number, z: number): number {
  const hash = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const smooth = (x: number, z: number) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const fx = x - i;
    const fz = z - j;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * u;
    const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * u;
    return a + (b - a) * v;
  };
  return smooth(x / 7, z / 7) * 0.65 + smooth(x / 2.3 + 40, z / 2.3) * 0.35;
}

/**
 * See-through trees. Every tree is drawn twice: solid, and as a ghost. A tree
 * standing between the camera and your animal hides its solid copy and shows
 * its ghost instead, faded the closer it is to the line of sight, so you can
 * always see yourself and what's ahead. Worked out per tree on the GPU from
 * where the camera and your animal are, so it costs nothing on the CPU.
 */
const SEE = { uEye: { value: new THREE.Vector3(0, 1e4, 0) }, uFocus: { value: new THREE.Vector3(0, 1e4, 0) } };
/** Trees closer than this to the line of sight fade all the way; they're solid again past SEE_OUT. */
const SEE_IN = 2.3;
const SEE_OUT = 3.8;

/** The same sum as the tree shader: 1 on the line from the camera to you, 0 well clear of it. */
function seeAmount(at: THREE.Vector3, eye: THREE.Vector3, focus: THREE.Vector3): number {
  const abx = focus.x - eye.x;
  const abz = focus.z - eye.z;
  const k = ((at.x - eye.x) * abx + (at.z - eye.z) * abz) / Math.max(abx * abx + abz * abz, 0.0001);
  const c = Math.max(0, Math.min(1, k));
  const d = Math.hypot(at.x - (eye.x + abx * c), at.z - (eye.z + abz * c));
  return (1 - THREE.MathUtils.smoothstep(d, SEE_IN, SEE_OUT)) * THREE.MathUtils.smoothstep(k, -0.08, 0.1) * (1 - THREE.MathUtils.smoothstep(k, 0.92, 1.04));
}

function seeThrough(base: THREE.Material, ghost: boolean): THREE.Material {
  const mat = base.clone();
  if (ghost) {
    mat.transparent = true;
    mat.depthWrite = false;
  }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEye = SEE.uEye;
    shader.uniforms.uFocus = SEE.uFocus;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uEye;\nuniform vec3 uFocus;\nvarying float vSee;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        {
          // Where this tree stands, and how close it is to the line from the camera to you.
          vec3 at = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec2 ab = uFocus.xz - uEye.xz;
          float k = dot(at.xz - uEye.xz, ab) / max(dot(ab, ab), 0.0001);
          float d = distance(at.xz, uEye.xz + ab * clamp(k, 0.0, 1.0));
          vSee = (1.0 - smoothstep(${SEE_IN.toFixed(2)}, ${SEE_OUT.toFixed(2)}, d)) * smoothstep(-0.08, 0.1, k) * (1.0 - smoothstep(0.92, 1.04, k));
          // Each copy skips the trees the other one draws.
          if (${ghost ? "vSee < 0.01" : "vSee >= 0.01"}) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vSee;")
      .replace("#include <color_fragment>", ghost ? "#include <color_fragment>\ndiffuseColor.a *= 1.0 - 0.74 * vSee;" : "#include <color_fragment>");
  };
  mat.customProgramCacheKey = () => (ghost ? "see-ghost" : "see-solid");
  return mat;
}

/** Worlds green enough for grass tufts on High. */
const GRASSY = new Set(["home", "reef", "bluffs", "lagoon", "storm"]);
/** Grass beyond this far from the camera isn't drawn (the fog has it by then). */
const GRASS_RANGE = 85;
const GRASS_CHUNK = 24;

interface Grass {
  group: THREE.Group;
  update(t: number, cam?: THREE.Vector3): void;
  dispose(): void;
}

/**
 * High graphics: tufts of grass that sway in the breeze, in chunks so the
 * far ones can be skipped.
 */
function buildGrass(match: Match, rng: () => number, P: WorldPalette): Grass {
  const group = new THREE.Group();
  // A tuft: three tapered blades fanned round, dark at the root and light at the tip.
  const positions: number[] = [];
  const colors: number[] = [];
  const root = new THREE.Color(P.grassHigh).multiplyScalar(0.72);
  const tip = new THREE.Color(P.grassLow).lerp(new THREE.Color("#ffffff"), 0.18);
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI + 0.3;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const lean = (b - 1) * 0.12;
    const w = 0.09;
    positions.push(-cx * w, 0, -cz * w, cx * w, 0, cz * w, lean * cz, 1, -lean * cx);
    colors.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  // Normals straight up, so the blades shade like the lawn they grow from.
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(positions.length / 3).fill([0, 1, 0]).flat(), 3));
  const time = { value: 0 };
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: RAMP, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      {
        vec4 at = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float gust = sin(uTime * 1.9 + at.x * 0.35 + at.z * 0.22) + 0.5 * sin(uTime * 3.1 + at.z * 0.6);
        transformed.x += gust * 0.16 * position.y;
        transformed.z += cos(uTime * 1.5 + at.x * 0.3) * 0.07 * position.y;
      }`,
    );
  };
  mat.customProgramCacheKey = () => "grass";

  const area = WORLD_HALF_X * WORLD_HALF_Z * 4;
  // About one tuft every 0.7 square meters on Home Isle, thinner on the giant maps.
  const spacing = Math.max(0.85, Math.sqrt(area / 70000));
  const chunks = new Map<string, THREE.Matrix4[]>();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const clear = (x: number, z: number) =>
    !onBridge(x, z) &&
    !match.bases.some((b) => Math.hypot(b.x - x, b.z - z) < match.baseRadius + 1.5) &&
    !match.stations.some((st) => Math.hypot(st.x - x, st.z - z) < 3.2);
  for (let x = -WORLD_HALF_X; x < WORLD_HALF_X; x += spacing) {
    for (let z = -WORLD_HALF_Z; z < WORLD_HALF_Z; z += spacing) {
      const px = x + (rng() - 0.5) * spacing;
      const pz = z + (rng() - 0.5) * spacing;
      const h = groundHeight(px, pz);
      if (h < 1.0) continue;
      const slope = Math.abs(groundHeight(px + 0.6, pz) - h) + Math.abs(groundHeight(px, pz + 0.6) - h);
      if (slope > 0.75 || !clear(px, pz)) continue;
      const s = 0.3 + rng() * 0.32;
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      const key = `${Math.floor(px / GRASS_CHUNK)},${Math.floor(pz / GRASS_CHUNK)}`;
      let list = chunks.get(key);
      if (!list) chunks.set(key, (list = []));
      list.push(new THREE.Matrix4().compose(new THREE.Vector3(px, h - 0.04, pz), q, new THREE.Vector3(s * 1.4, s, s * 1.4)));
    }
  }
  const batches: Array<{ mesh: THREE.InstancedMesh; x: number; z: number }> = [];
  for (const [key, list] of chunks) {
    const [cx, cz] = key.split(",").map(Number);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
    batches.push({ mesh, x: (cx + 0.5) * GRASS_CHUNK, z: (cz + 0.5) * GRASS_CHUNK });
  }
  return {
    group,
    update(t, cam) {
      time.value = t;
      if (!cam) return;
      const reach = GRASS_RANGE + GRASS_CHUNK * 0.71;
      for (const b of batches) b.mesh.visible = Math.hypot(b.x - cam.x, b.z - cam.z) < reach;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

/** High graphics: a sky dome with a sun, fading into the fog at the horizon. */
function buildSkyDome(P: WorldPalette): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(P.skyTop) },
      uHorizon: { value: new THREE.Color(P.skyHorizon) },
      uFog: { value: new THREE.Color(P.fog) },
      uSun: { value: new THREE.Color(P.sun) },
      uSunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uFog;
      uniform vec3 uSun;
      uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.5, y), 0.7));
        col = mix(uFog, col, smoothstep(-0.02, 0.06, y));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(s, 900.0) * 3.5 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.08);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 40, 20), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  return dome;
}

/** A tiling texture of soft ripples (or lava veins) drawn once at start up. */
function rippleTexture(lava: boolean): THREE.CanvasTexture {
  const N = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  // Waves with whole numbers of cycles across the tile, so it repeats seamlessly.
  const waves = [
    [3, 1, 0.0, 1],
    [1, 4, 1.3, 0.8],
    [5, -2, 2.1, 0.55],
    [-2, 7, 0.7, 0.4],
    [8, 3, 4.2, 0.3],
    [-9, 5, 3.3, 0.22],
  ];
  const height = (u: number, v: number) => {
    let h = 0;
    for (const [a, b, p, amp] of waves) h += Math.sin((a * u + b * v) * Math.PI * 2 + p) * amp;
    return h;
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const v = j / N;
      const k = (j * N + i) * 4;
      if (lava) {
        // Bright veins where the waves cross zero, dark crust between.
        const vein = Math.pow(1 - Math.min(1, Math.abs(height(u, v)) / 0.6), 3);
        img.data[k] = 120 + 135 * vein;
        img.data[k + 1] = 40 + 160 * vein;
        img.data[k + 2] = 20 + 40 * vein;
      } else {
        // A normal map from the slope of the waves.
        const e = 1 / N;
        const dx = (height(u + e, v) - height(u - e, v)) * 0.5;
        const dz = (height(u, v + e) - height(u, v - e)) * 0.5;
        const n = new THREE.Vector3(-dx * 6, -dz * 6, 1).normalize();
        img.data[k] = (n.x * 0.5 + 0.5) * 255;
        img.data[k + 1] = (n.y * 0.5 + 0.5) * 255;
        img.data[k + 2] = (n.z * 0.5 + 0.5) * 255;
      }
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = lava ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

interface RichLiquid {
  material: THREE.MeshStandardMaterial | THREE.MeshToonMaterial;
  update(t: number): void;
  dispose(): void;
}

/**
 * High graphics: water that ripples and mirrors the sky, with the sun
 * glinting off it; or lava with glowing veins that slowly flow.
 */
function richLiquid(P: WorldPalette, lava: boolean, geo: THREE.PlaneGeometry, renderer?: THREE.WebGLRenderer): RichLiquid {
  const tex = rippleTexture(lava);
  const size = geo.parameters;
  tex.repeat.set(size.width / (lava ? 26 : 16), size.height / (lava ? 26 : 16));
  if (lava) {
    const material = new THREE.MeshToonMaterial({ color: P.waterShallow, gradientMap: RAMP, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.95 });
    return {
      material,
      update(t) {
        tex.offset.set(t * 0.004, t * 0.0025);
      },
      dispose() {
        tex.dispose();
        material.dispose();
      },
    };
  }
  // The sky, baked once into a reflection map.
  let env: THREE.WebGLRenderTarget | null = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    skyScene.add(buildSkyDome(P));
    env = pmrem.fromScene(skyScene, 0.02, 1, 1000);
    pmrem.dispose();
  }
  const material = new THREE.MeshStandardMaterial({
    color: P.waterShallow,
    roughness: 0.16,
    metalness: 0.05,
    normalMap: tex,
    normalScale: new THREE.Vector2(0.55, 0.55),
    envMap: env?.texture ?? null,
    envMapIntensity: 0.85,
    transparent: true,
    opacity: 0.8,
  });
  return {
    material,
    update(t) {
      tex.offset.set(t * 0.012, t * 0.007);
    },
    dispose() {
      tex.dispose();
      env?.dispose();
      material.dispose();
    },
  };
}
