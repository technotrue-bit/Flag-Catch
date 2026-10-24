/**
 * FLAG CATCH. Three lands in a row (yours, the middle, the enemy's), two
 * teams of 8 to 64 animals, flags, bases, firecrackers and power ups.
 *
 * Flow: pick your animal, mode and team size, then 3, 2, 1, GO!, then the
 * match, then results.
 */
import * as THREE from "three";
import { ANIMALS } from "./animals";
import { music, sfx, unlockAudio } from "./audio";
import { Fx } from "./fx";
import { type MatchStats, createHud } from "./hud";
import { createControls } from "./input";
import { type AnimalRig, buildAnimal } from "./critters";
import { type FlagRig, buildFlag, buildMedicBadge, buildRespawnFlag, toon } from "./models";
import { FLAG_ENEMY, FLAG_FREE, ME_GLOW, TEAMS } from "./palette";
import { type Difficulty, HOARD_TARGET, ITEMS, type Input, type Match, type Mode, NO_INPUT, STEP, createMatch, setAnimal, step, wrapAngle } from "./sim";
import * as progressStore from "./progress";
import { MAPS, WATER_Y, groundHeight, landOf, mapFor, surfaceHeight } from "./terrain";
import { WORLDS } from "./worlds";
import { type World, buildWorld } from "./world";

const params = new URLSearchParams(location.search);
const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
// Points and unlocks; ?unlock=all opens everything for testing.
const progress = progressStore.load(store);
const unlockAll = params.get("unlock") === "all";
const isOpen = (id: string) => progressStore.unlocked(progress, unlockAll).has(id);
// Saved at once, so a first visit is never mistaken for a player from before unlocks.
progressStore.save(store, progress);
let humanAnimal = ANIMALS[params.get("animal") ?? ""] ? params.get("animal")! : loadAnimal();
if (!isOpen(humanAnimal)) humanAnimal = "lion";
let worldId = WORLDS.some((w) => w.id === params.get("world")) ? params.get("world")! : loadWorld();
if (!isOpen(worldId)) worldId = "home";
// Team size: 8 a side at least, up to 64; ?per= still allows small test games.
let humanMedic = loadMedic();
let difficulty: Difficulty = loadDifficulty();
let perTeam = params.has("per") ? clampInt(Number(params.get("per")), 1, 64) : loadSize();
const timeParam = params.has("time") ? clampInt(Number(params.get("time")), 20, 900) : 0;
let mode: Mode = params.get("mode") === "hoard" || params.get("mode") === "playful" ? (params.get("mode") as Mode) : loadMode();
if (!isOpen(mode)) mode = "capture";

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 400);

let match: Match = newMatch(Number(params.get("seed") ?? 1));
let world: World = buildWorld(scene, match);
const fx = new Fx(scene);
const controls = createControls(renderer.domElement);
const hud = createHud(controls);

interface PlayerView {
  rig: AnimalRig;
  ring: THREE.Mesh;
  /** Your own animal's halo, arrow and lit up materials. */
  me?: { halo: THREE.Mesh; arrow: THREE.Mesh; mats: THREE.MeshToonMaterial[] };
  /** Shield bubble or Star glow, made on first use. */
  aura?: THREE.Mesh;
  /** The red cross a medic wears. */
  badge?: THREE.Group;
  animal: string;
  bank: number;
  spin: number;
  /** Landing squash, 1 just after touchdown. */
  squash: number;
  /** Seconds left of a happy spin after banking a flag. */
  cheer: number;
  grounded: boolean;
  fallVy: number;
  lastSpeed: number;
  lean: number;
}
let views: PlayerView[] = [];
/**
 * Where each animal was one sim step ago. The sim ticks at 60 Hz but phones
 * draw at 60 or 120, so animals and the camera are drawn part way between
 * the last two steps, which keeps motion smooth at any frame rate.
 */
let prev = new Float32Array(0);
let alpha = 1;
const ip = { x: 0, y: 0, z: 0, h: 0 };
function snapshot(): void {
  if (prev.length !== match.players.length * 4) prev = new Float32Array(match.players.length * 4);
  for (const p of match.players) prev.set([p.x, p.y, p.z, p.heading], p.id * 4);
}
/** The drawn position of `p` this frame. */
function drawn(p: Match["players"][number]): typeof ip {
  const k = p.id * 4;
  if (prev.length <= k || Math.abs(prev[k] - p.x) + Math.abs(prev[k + 2] - p.z) > 6) {
    ip.x = p.x;
    ip.y = p.y;
    ip.z = p.z;
    ip.h = p.heading;
    return ip;
  }
  ip.x = prev[k] + (p.x - prev[k]) * alpha;
  ip.y = prev[k + 1] + (p.y - prev[k + 1]) * alpha;
  ip.z = prev[k + 2] + (p.z - prev[k + 2]) * alpha;
  ip.h = prev[k + 3] + wrapAngle(p.heading - prev[k + 3]) * alpha;
  return ip;
}
const flagViews: FlagRig[] = [];
const fireGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10);
fireGeo.rotateX(Math.PI / 2);
const fireMat = toon("#e8455b");
const bombGeo = new THREE.SphereGeometry(0.38, 12, 8);
const bombMat = toon("#3b3550");
const missileGeo = new THREE.ConeGeometry(0.3, 1.1, 4);
missileGeo.rotateX(Math.PI / 2);
const missileMat = toon("#f4f1e8");
const fireMeshes = new Map<number, THREE.Mesh>();
const respawnViews = new Map<number, THREE.Group>();
const ringGeo = new THREE.CircleGeometry(1.2, 24);
ringGeo.rotateX(-Math.PI / 2);
// A solid team colored band round a soft fill, so red and blue read at a glance.
const bandGeo = new THREE.RingGeometry(1.0, 1.32, 32);
bandGeo.rotateX(-Math.PI / 2);
const haloGeo = new THREE.RingGeometry(1.45, 1.75, 32);
haloGeo.rotateX(-Math.PI / 2);
const arrowGeo = new THREE.ConeGeometry(0.42, 0.75, 4);
arrowGeo.rotateX(Math.PI);
// Shared so a crowd of rings costs four materials, not 256.
const ringMats = TEAMS.map((t) => new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.32, depthWrite: false }));
const bandMats = TEAMS.map((t) => new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.95, depthWrite: false }));
const haloMat = new THREE.MeshBasicMaterial({ color: ME_GLOW, transparent: true, opacity: 0.9, depthWrite: false });
// Drawn over trees and hills, so you can always find yourself.
const arrowMat = new THREE.MeshBasicMaterial({ color: ME_GLOW, depthTest: false, transparent: true });
const shieldGeo = new THREE.SphereGeometry(1.7, 16, 12);
const shieldMat = new THREE.MeshBasicMaterial({ color: "#7fd8ff", transparent: true, opacity: 0.28, depthWrite: false });
const starMat = new THREE.MeshBasicMaterial({ color: "#ffd166", transparent: true, opacity: 0.4, depthWrite: false });
const boltGeo = new THREE.CylinderGeometry(0.18, 0.05, 1, 5);
boltGeo.translate(0, 0.5, 0);
const boltMat = new THREE.MeshBasicMaterial({ color: "#fff27a", transparent: true, opacity: 0.95 });
/** Lightning bolts and blast rings that fade out on their own. */
const flashes: Array<{ mesh: THREE.Mesh; life: number; max: number; grow: number; rise?: boolean }> = [];
const warnMat = new THREE.MeshBasicMaterial({ color: "#fff27a", transparent: true, opacity: 0.2, depthWrite: false });
const UP = new THREE.Vector3(0, 1, 0);
const slope = new THREE.Vector3();
const WAKE = ["#ffffff", "#d8f6f7"];
const EMBERS = ["#ffb347", "#ff7a2f"];
// Animals beyond the fog are hidden, which matters with 128 of them.
const DRAW_RANGE = 230;

function newMatch(seed: number): Match {
  const map = mapFor(perTeam);
  // Hoard ends at the points target; the 15 minute cap only stops a stalemate.
  const duration = mode === "hoard" ? 900 : timeParam || map.duration;
  return createMatch({ seed, humanAnimal, perTeam, duration, flagsPerTeam: map.flagsPerTeam, mode, map, humanMedic, difficulty, world: worldId });
}

function rebuildViews(): void {
  for (const v of views) {
    scene.remove(v.rig.root);
    scene.remove(v.ring);
    if (v.aura) scene.remove(v.aura);
  }
  views = match.players.map((p) => makeView(p.def.id, p.team, p.id === 0));
  for (const f of flagViews) scene.remove(f.root);
  flagViews.length = 0;
  for (let i = 0; i < match.flags.length; i++) {
    const f = buildFlag();
    scene.add(f.root);
    flagViews.push(f);
  }
  for (const mesh of fireMeshes.values()) scene.remove(mesh);
  fireMeshes.clear();
  for (const g of respawnViews.values()) scene.remove(g);
  respawnViews.clear();
}

function makeView(animal: string, team: number, me: boolean): PlayerView {
  const rig = buildAnimal(animal, TEAMS[team].color);
  scene.add(rig.root);
  const ring = new THREE.Mesh(ringGeo, ringMats[team]);
  ring.add(new THREE.Mesh(bandGeo, bandMats[team]));
  scene.add(ring);
  const badge = buildMedicBadge();
  badge.position.y = 2.95;
  rig.root.add(badge);
  const view: PlayerView = { rig, ring, animal, bank: 0, spin: 0, badge, squash: 0, cheer: 0, grounded: true, fallVy: 0, lastSpeed: 0, lean: 0 };
  if (me) {
    const halo = new THREE.Mesh(haloGeo, haloMat);
    ring.add(halo);
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.renderOrder = 10;
    arrow.position.y = 3.4;
    rig.root.add(arrow);
    // Your own copies of the toon materials, so only your animal lights up.
    const mats: THREE.MeshToonMaterial[] = [];
    const copies = new Map<THREE.Material, THREE.MeshToonMaterial>();
    rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !(mesh.material instanceof THREE.MeshToonMaterial)) return;
      let copy = copies.get(mesh.material);
      if (!copy) {
        copy = mesh.material.clone();
        copy.emissive.set(ME_GLOW);
        copies.set(mesh.material, copy);
        mats.push(copy);
      }
      mesh.material = copy;
    });
    view.me = { halo, arrow, mats };
  }
  return view;
}

function swapAnimal(id: string): void {
  if (id === views[0]?.animal) return;
  humanAnimal = id;
  setAnimal(match.players[0], id);
  scene.remove(views[0].rig.root);
  scene.remove(views[0].ring);
  views[0] = makeView(id, 0, true);
}
rebuildViews();

// Camera follows behind the heading with a little lag, lifts when airborne.
let camYaw = match.players[0].heading;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let shake = 0;
let hitStop = 0;
type Phase = "select" | "countdown" | "play" | "results";
let phase: Phase = "select";
let lastLand = landOf(match.players[0].z);
placeCamera(1);

function placeCamera(blend: number): void {
  const me = match.players[0];
  const p = { ...drawn(me), speed: me.speed };
  const air = Math.max(0, p.y - surfaceHeight(p.x, p.z));
  const z = hud.camScale;
  const dist = (9.5 + Math.min(4, air * 0.4) + p.speed * 0.08) * z;
  const height = (4.2 + Math.min(5, air * 0.5)) * z;
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  const want = new THREE.Vector3(p.x - fx * dist, p.y + height, p.z - fz * dist);
  // Never dip under the ground or the sea.
  want.y = Math.max(want.y, surfaceHeight(want.x, want.z) + 1.5);
  camPos.lerp(want, blend);
  const look = new THREE.Vector3(p.x + fx * 4, p.y + 1.6, p.z + fz * 4);
  camLook.lerp(look, Math.min(1, blend * 1.6));
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
  camera.lookAt(camLook);
}

function humanInput(): Input {
  if (phase !== "play" || match.over) return NO_INPUT;
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  // Screen right is forward x up: (-fz, fx).
  const dirX = fx * controls.steerY - fz * controls.steerX;
  const dirZ = fz * controls.steerY + fx * controls.steerX;
  const input: Input = {
    dirX,
    dirZ,
    jump: controls.jump,
    throwPressed: controls.throwQueued,
    dive: controls.dive,
    useItem: controls.itemQueued,
    plant: controls.plantQueued,
  };
  controls.throwQueued = false;
  controls.itemQueued = false;
  controls.plantQueued = false;
  return input;
}

let stats: MatchStats = freshStats();
function freshStats(): MatchStats {
  return { steals: 0, banks: 0, hits: 0, knockouts: 0, saves: 0, items: 0 };
}

/** Counts what you did, for the results card. */
function countStats(): void {
  for (const e of match.events) {
    if (e.kind === "grab" && e.player === 0) stats.steals++;
    else if (e.kind === "bank" && e.player === 0) stats.banks++;
    else if (e.kind === "hit" && e.by === 0) stats.hits++;
    else if (e.kind === "pop" && e.by === 0) stats.knockouts++;
    else if (e.kind === "return" && e.player === 0) stats.saves++;
    else if (e.kind === "item" && e.player === 0) stats.items++;
  }
}

function handleEvents(): void {
  countStats();
  const right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
  for (const e of match.events) {
    if (e.kind === "end") {
      sfx.end();
      continue;
    }
    if (e.kind === "jump") {
      if (e.player === 0) sfx.jump(0, 1);
      continue;
    }
    const ex = "x" in e ? e.x : 0;
    const ez = "z" in e ? e.z : 0;
    const dx = ex - camera.position.x;
    const dz = ez - camera.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const pan = (dx * right.x + dz * right.z) / dist;
    const near = Math.max(0.12, Math.min(1, 1 - dist / 80));
    const mine = "player" in e && e.player === 0;
    switch (e.kind) {
      case "throw":
        sfx.throw(pan, near);
        break;
      case "pop": {
        sfx.pop(pan, near);
        const p = match.players[e.player];
        fx.burst(e.x, e.y, e.z, ["#ffd166", "#ff6b5b", "#ffffff", TEAMS[p.team].color], 26, 9);
        if (mine) {
          shake = 0.6;
          hitStop = 0.08;
          hud.call("POPPED!", "#ff6b5b");
        } else if (e.by === 0) {
          shake = 0.25;
          hitStop = 0.05;
          hud.call("POP!", "#ffd166");
        }
        break;
      }
      case "fizzle":
        sfx.fizzle(pan, near);
        fx.burst(e.x, e.y, e.z, ["#ffd166", "#ffffff"], 6, 3, 6, 0.18);
        break;
      case "grab": {
        sfx.grab(pan, near);
        const thief = match.players[e.player];
        fx.burst(e.x, e.y + 2, e.z, [TEAMS[thief.team === 0 ? 1 : 0].color, "#ffffff"], 10, 4, 10, 0.2);
        if (mine) hud.call("GOT ONE! RUN HOME!", FLAG_FREE);
        else if (thief.team === 1) hud.call("THEY TOOK A FLAG!", FLAG_ENEMY);
        break;
      }
      case "return":
        sfx.grab(pan, near);
        fx.burst(e.x, e.y + 1, e.z, [TEAMS[e.team].color, "#ffffff"], 16, 6, 12, 0.22);
        if (mine) hud.call("SAVED!", TEAMS[0].color);
        else if (e.team === 0 && e.player >= 0) hud.call("FLAG SAVED", TEAMS[0].light);
        break;
      case "drop":
        sfx.drop(pan, near);
        break;
      case "bank":
        views[e.player].cheer = 1.1;
        sfx.bank(pan, near);
        fx.burst(e.x, e.y + 1, e.z, ["#ffd166", "#ff6b5b", "#46b4e8", "#7ee36b", "#b3a9ff"], 60, 12, 14, 0.3);
        // In Hoard a bank adds a flag that earns points, not a point itself.
        const hoard = match.mode === "hoard";
        if (mine) hud.call(hoard ? "FLAG BANKED!" : "YOU SCORED!", TEAMS[0].color);
        else if (e.team === 0) hud.call(hoard ? "TEAM BANKED A FLAG!" : "TEAM SCORED!", TEAMS[0].color);
        else hud.call(hoard ? "THEY BANKED ONE" : "THEY SCORED", TEAMS[1].light);
        break;
      case "splash":
        sfx.splash(pan, near);
        fx.burst(e.x, 0.2, e.z, ["#ffffff", "#bff0f5"], 14, 5, 16, 0.2);
        break;
      case "dive":
      case "surface":
        sfx.splash(pan, near * 0.6);
        fx.burst(e.x, 0.2, e.z, ["#ffffff", "#bff0f5"], 10, 3.5, 14, 0.18);
        break;
      case "boom":
        sfx.pop(pan, near);
        fx.burst(e.x, e.y + 0.5, e.z, ["#ffd166", "#ff9f1c", "#3b3550", "#ffffff"], 40, 10, 16, 0.32);
        if (e.player === 0) shake = Math.max(shake, 0.2);
        break;
      case "item":
        if (mine) {
          sfx.item(0, 1);
          hud.call(`GOT ${ITEMS[e.item].name}!`, "#ff6b9a");
        }
        fx.burst(e.x, 2, e.z, ["#ff6b9a", "#ffd166", "#ffffff"], mine ? 24 : 10, 5, 10, 0.2);
        break;
      case "use":
        sfx.use(pan, near);
        if (e.item === "blast") {
          sfx.pop(pan, near);
          flash(e.x, e.y + 0.4, e.z, "blast");
          if (mine) shake = Math.max(shake, 0.35);
        } else if (e.item === "superjump") {
          fx.burst(e.x, e.y, e.z, ["#ffffff", "#bff0f5", "#ffd166"], 24, 7, 12, 0.22);
        } else if (e.item === "star" || e.item === "shield" || e.item === "turbo") {
          fx.burst(e.x, e.y + 1, e.z, e.item === "shield" ? ["#7fd8ff", "#ffffff"] : ["#ffd166", "#ff6b9a", "#ffffff"], 20, 5, 10, 0.2);
        }
        if (mine && e.item === "lightning") shake = Math.max(shake, 0.3);
        break;
      case "zap":
        sfx.zap(pan, near);
        flash(e.x, e.y, e.z, "bolt");
        break;
      case "strike_warn":
        warnRing(e.x, e.z, e.t);
        break;
      case "strike":
        sfx.zap(pan, near);
        flash(e.x, e.y, e.z, "bolt");
        world.flash();
        if (near > 0.6) shake = Math.max(shake, 0.35);
        break;
      case "burn":
        sfx.fizzle(pan, near);
        fx.burst(e.x, e.y + 0.4, e.z, ["#ff7a2f", "#ffd166", "#3a2f36"], 18, 6, 10, 0.24);
        if (mine) hud.call("HOT HOT LAVA!", "#ff7a2f");
        break;
      case "hit": {
        sfx.block(pan, near);
        const p = match.players[e.player];
        fx.burst(e.x, e.y, e.z, ["#ffd166", "#ffffff", TEAMS[p.team].color], 10, 5, 8, 0.18);
        if (mine) {
          shake = Math.max(shake, 0.3);
          hud.call(e.hp === 1 ? "ONE HIT LEFT!" : "HIT!", "#ff6b5b");
        } else if (e.by === 0) {
          hud.call("HIT!", "#ffd166");
        }
        break;
      }
      case "respawn":
        fx.burst(e.x, e.y + 0.8, e.z, ["#ffffff", "#7ee36b", TEAMS[match.players[e.player].team].light], 18, 5, 9, 0.2);
        if (mine) hud.call("BACK IN!", "#7ee36b");
        break;
      case "plant": {
        const team = match.players[e.player].team;
        sfx.item(pan, near);
        fx.burst(e.x, 1.5, e.z, ["#ffffff", "#3cbf7a", TEAMS[team].color], 20, 5, 9, 0.2);
        if (mine) hud.call("RESPAWN FLAG UP!", "#3cbf7a");
        break;
      }
      case "unplant":
        sfx.pop(pan, near);
        fx.burst(e.x, 1.5, e.z, ["#ffffff", "#e8455b", "#ffd166"], 20, 6, 10, 0.2);
        if (e.by === 0) hud.call("KNOCKED DOWN THEIR FLAG!", "#ffd166");
        // An enemy knocking one down means it was ours.
        else if (match.players[e.by].team === 1) hud.call("OUR RESPAWN FLAG FELL", TEAMS[1].light);
        break;
      case "block":
        sfx.block(pan, near);
        fx.burst(e.x, e.y, e.z, ["#7fd8ff", "#ffffff", "#ffd166"], 12, 5, 8, 0.18);
        if (mine) hud.call("BLOCKED!", "#7fd8ff");
        break;
    }
  }
}

/** Storm Spire: a glowing ring where lightning is about to land. */
function warnRing(x: number, z: number, life: number): void {
  const mesh = new THREE.Mesh(ringGeo, warnMat.clone());
  mesh.position.set(x, surfaceHeight(x, z) + 0.15, z);
  mesh.scale.setScalar(2.9);
  scene.add(mesh);
  flashes.push({ mesh, life, max: life, grow: 0, rise: true });
}

/** A lightning bolt down onto a spot, or a blast ring spreading from one. */
function flash(x: number, y: number, z: number, kind: "bolt" | "blast"): void {
  const mesh = kind === "bolt" ? new THREE.Mesh(boltGeo, boltMat.clone()) : new THREE.Mesh(ringGeo, starMat.clone());
  if (kind === "bolt") {
    mesh.position.set(x, y, z);
    mesh.scale.set(1, 40, 1);
    fx.burst(x, y + 0.6, z, ["#fff27a", "#ffffff", "#7fd8ff"], 18, 6, 10, 0.2);
  } else {
    mesh.position.set(x, y, z);
  }
  scene.add(mesh);
  flashes.push({ mesh, life: kind === "bolt" ? 0.3 : 0.45, max: kind === "bolt" ? 0.3 : 0.45, grow: kind === "bolt" ? 0 : 5.5 });
}

function stepFlashes(dt: number): void {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.life -= dt;
    const k = Math.max(0, f.life / f.max);
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = f.rise ? 0.2 + (1 - k) * 0.6 + Math.sin(f.life * 30) * 0.12 : k * 0.9;
    if (f.grow) f.mesh.scale.setScalar(1 + (1 - k) * f.grow);
    if (f.life <= 0) {
      scene.remove(f.mesh);
      (f.mesh.material as THREE.Material).dispose();
      flashes.splice(i, 1);
    }
  }
}

function syncViews(t: number, dt: number): void {
  const cx = camera.position.x;
  const cz = camera.position.z;
  for (const p of match.players) {
    const v = views[p.id];
    const r = v.rig;
    // Knocked out animals are off the field until they respawn.
    const far = Math.hypot(p.x - cx, p.z - cz) > DRAW_RANGE || p.out > 0;
    r.root.visible = v.ring.visible = !far;
    if (v.badge) v.badge.visible = p.medic;
    // Shield bubble or Star glow while one runs.
    const powered = p.shieldT > 0 || p.starT > 0;
    if (powered && !v.aura) {
      v.aura = new THREE.Mesh(shieldGeo, shieldMat);
      scene.add(v.aura);
    }
    if (v.aura) {
      v.aura.visible = powered && !far;
      if (powered) {
        v.aura.material = p.starT > 0 ? starMat : shieldMat;
        v.aura.position.set(p.x, p.y + 1.1, p.z);
        const blink = Math.min(p.shieldT, p.starT > 0 ? p.starT : Infinity) < 1.5 && Math.sin(t * 30) > 0;
        v.aura.scale.setScalar(blink ? 0.01 : 1 + Math.sin(t * 8 + p.id) * 0.05);
      }
    }
    if (far) continue;
    if (p.starT > 0 && Math.random() < 0.5) fx.burst(p.x, p.y + 1, p.z, ["#ffd166", "#ff6b9a", "#7fd8ff", "#7ee36b"], 1, 3, 4, 0.16);
    if (p.turboT > 0 && p.speed > 4 && Math.random() < 0.6) fx.burst(p.x, p.y + 0.4, p.z, ["#ff6b5b", "#ffd166"], 1, 1.5, 3, 0.14);
    const at = drawn(p);
    r.root.position.set(at.x, at.y, at.z);
    r.root.rotation.y = at.h;
    animate(v, p, t, dt);
    const surf = surfaceHeight(p.x, p.z);
    // Tilt the ring to the slope so it never sinks into a hillside.
    slope.set(surfaceHeight(p.x - 0.8, p.z) - surfaceHeight(p.x + 0.8, p.z), 1.6, surfaceHeight(p.x, p.z - 0.8) - surfaceHeight(p.x, p.z + 0.8)).normalize();
    v.ring.quaternion.setFromUnitVectors(UP, slope);
    v.ring.position.set(at.x, surfaceHeight(at.x, at.z) + 0.1, at.z);
    // Dust behind wheels on land and a white wake on the water.
    const near = Math.hypot(p.x - cx, p.z - cz) < 45;
    if (near && p.onSurface && p.speed > 6 && p.y > WATER_Y - 0.3 && Math.random() < dt * p.speed * 1.4) {
      const bx = p.x - Math.sin(p.heading) * 1.1 + (Math.random() - 0.5) * 0.8;
      const bz = p.z - Math.cos(p.heading) * 1.1 + (Math.random() - 0.5) * 0.8;
      const ground = groundHeight(bx, bz);
      const P = match.world.palette;
      const colors = ground <= WATER_Y ? (match.world.liquid === "lava" ? EMBERS : WAKE) : ground < 0.9 ? [P.sand, P.foam] : [P.grassLow, P.sand];
      fx.burst(bx, surf + 0.15, bz, colors, 1, 1.6, 3, 0.24);
    }
    const air = p.y - surf;
    v.ring.scale.setScalar(Math.max(0.4, 1 - air * 0.06));
    if (v.me) {
      // A gentle pulse: the halo breathes, the arrow bobs, the animal glows.
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      v.me.halo.scale.setScalar(1 + pulse * 0.12);
      haloMat.opacity = 0.55 + pulse * 0.4;
      v.me.arrow.position.y = 3.4 + pulse * 0.35;
      v.me.arrow.rotation.y = t * 2;
      for (const mat of v.me.mats) mat.emissiveIntensity = 0.18 + pulse * 0.17;
    }
  }

  // Flags wear the color of the base they belong to.
  match.flags.forEach((f, i) => {
    const v = flagViews[i];
    const cloth = v.cloth.material as THREE.MeshToonMaterial;
    const glow = v.glow.material as THREE.MeshBasicMaterial;
    const team = TEAMS[f.team];
    cloth.color.set(team.color);
    glow.color.set(team.light);
    if (f.state === "carried") {
      // Riding on the carrier, drawn where the carrier is drawn.
      const c = drawn(match.players[f.carrier]);
      const back = 0.7;
      v.root.position.set(c.x - Math.sin(c.h) * back, c.y + 1.1, c.z - Math.cos(c.h) * back);
      v.root.rotation.y = c.h + Math.PI / 2;
      v.root.scale.setScalar(0.8);
      v.glow.visible = false;
    } else if (f.state === "dropped") {
      // A dropped flag bobs and pulses so both teams spot it.
      v.root.position.set(f.x, f.y + Math.sin(t * 5 + i) * 0.2, f.z);
      v.root.rotation.y = t * 1.6 + i;
      v.root.scale.setScalar(1.1);
      v.glow.visible = true;
      glow.opacity = 0.45 + 0.35 * Math.sin(t * 8 + i);
    } else {
      v.root.position.set(f.x, f.y + 0.3, f.z);
      v.root.rotation.y = Math.sin(t * 1.2 + i) * 0.4 + Math.atan2(f.x - match.bases[f.base].x, f.z - match.bases[f.base].z);
      v.root.scale.setScalar(0.85);
      v.glow.visible = true;
      glow.opacity = 0.3;
    }
  });

  // Respawn flags come and go as medics plant them and enemies knock them down.
  const planted = new Set<number>();
  for (const f of match.respawns) {
    planted.add(f.id);
    let g = respawnViews.get(f.id);
    if (!g) {
      g = buildRespawnFlag(TEAMS[f.team].color);
      g.position.set(f.x, surfaceHeight(f.x, f.z), f.z);
      scene.add(g);
      respawnViews.set(f.id, g);
    }
    g.rotation.y = Math.sin(t * 1.5 + f.id) * 0.3;
  }
  for (const [id, g] of respawnViews) {
    if (planted.has(id)) continue;
    scene.remove(g);
    respawnViews.delete(id);
  }

  const alive = new Set<number>();
  for (const f of match.fires) {
    alive.add(f.id);
    let mesh = fireMeshes.get(f.id);
    const missile = f.homing !== undefined && f.homing !== -1;
    if (!mesh) {
      mesh = new THREE.Mesh(f.bomb ? bombGeo : missile ? missileGeo : fireGeo, f.bomb ? bombMat : missile ? missileMat : fireMat);
      scene.add(mesh);
      fireMeshes.set(f.id, mesh);
    }
    mesh.position.set(f.x, f.y, f.z);
    mesh.rotation.y = Math.atan2(f.vx, f.vz);
    if (missile) mesh.rotation.z += dt * 6;
    else mesh.rotation.x += dt * 12;
    if (Math.random() < 0.5) fx.burst(f.x, f.y + 0.2, f.z, ["#ffd166", "#ff9f1c"], 1, 1.5, 2, 0.14);
  }
  for (const [id, mesh] of fireMeshes) {
    if (!alive.has(id)) {
      scene.remove(mesh);
      fireMeshes.delete(id);
    }
  }
}

/**
 * Bring an animal to life: lean into turns and against speeding up, bounce
 * over bumps (the frog on its pogo stick), squash on landing and stretch on
 * the way up, breathe and look about when still, flap, spin when stunned
 * and twirl for joy after banking a flag.
 */
function animate(v: PlayerView, p: Match["players"][number], t: number, dt: number): void {
  const r = v.rig;
  const id = p.id;
  const turn = wrapAngle(p.heading - (r.root.userData.lastHeading ?? p.heading)) / dt;
  r.root.userData.lastHeading = p.heading;
  v.bank += (Math.max(-0.45, Math.min(0.45, -turn * 0.12)) - v.bank) * Math.min(1, dt * 8);
  const accel = (p.speed - v.lastSpeed) / dt;
  v.lastSpeed = p.speed;
  v.lean += (Math.max(-0.16, Math.min(0.16, -accel * 0.008)) - v.lean) * Math.min(1, dt * 6);
  const moving = Math.min(1, p.speed / 10);
  const still = 1 - moving;

  if (p.onSurface && !v.grounded && v.fallVy < -3) v.squash = Math.min(1, -v.fallVy / 14);
  v.grounded = p.onSurface;
  v.fallVy = p.vy;
  v.squash = Math.max(0, v.squash - dt * 5);
  v.cheer = Math.max(0, v.cheer - dt);
  const stretch = p.onSurface ? 0 : Math.max(-0.08, Math.min(0.12, p.vy * 0.012));
  const breathe = Math.sin(t * 2.4 + id) * 0.025 * still;
  const sy = 1 - 0.24 * v.squash + stretch + breathe;
  const sxz = 1 + 0.13 * v.squash - stretch * 0.5;
  r.body.scale.set(sxz, sy, sxz);

  let y = 0;
  let roll = 0;
  if (r.style === "hop") {
    // Boing: the frog springs along, its pogo spring squeezing on each touch.
    const h = Math.abs(Math.sin(t * 9 + id));
    if (p.onSurface) y = h * 0.45 * moving;
    if (r.pogo) r.pogo.scale.y = p.onSurface ? 1 - (1 - h) * 0.4 * moving - 0.3 * v.squash : 1.1;
  } else if (r.style === "swim" && p.medium === "water") {
    y = Math.sin(t * 3 + id) * 0.07;
    roll = Math.sin(t * 2.1 + id) * 0.06;
  } else if (r.style === "fly" && !p.onSurface) {
    y = Math.sin(t * 3 + id) * 0.15;
  } else if (p.onSurface) {
    y = Math.abs(Math.sin(t * 14 + id)) * 0.07 * moving;
  }
  // A happy hop and twirl after banking a flag.
  const joy = v.cheer > 0 ? 1 - v.cheer / 1.1 : 0;
  if (v.cheer > 0) y += Math.sin(joy * Math.PI) * 1.1;
  r.body.position.y = y;
  r.body.rotation.z = v.bank + roll;
  const pitch = p.onSurface ? v.lean : Math.max(-0.4, Math.min(0.4, -p.vy * 0.04));
  r.body.rotation.x = r.style === "fly" && !p.onSurface ? pitch + 0.15 * moving : pitch;
  if (p.stun > 0) v.spin += dt * 18;
  else v.spin *= 0.8;
  r.body.rotation.y = v.spin + (v.cheer > 0 ? joy * Math.PI * 2 : 0);

  // The head turns into corners, glances about when still and nods along.
  r.head.rotation.y = -v.bank * 0.8 + Math.sin(t * 0.6 + id * 1.7) * 0.45 * still;
  r.head.rotation.x = Math.sin(t * 14 + id) * 0.05 * moving + Math.sin(t * 1.3 + id) * 0.04 * still + (p.stun > 0 ? Math.sin(t * 20) * 0.2 : 0);
  r.head.rotation.z = p.stun > 0 ? Math.sin(t * 17) * 0.25 : 0;

  for (const w of r.wheels) w.rotation.x += p.speed * dt * 2.5;
  let flap: number;
  if (v.cheer > 0) flap = -0.8 + Math.sin(t * 22) * 0.4;
  else if (r.style === "fly") flap = p.onSurface ? 0.35 + Math.sin(t * 3 + id) * 0.08 : Math.sin(t * 13 + id) * 0.7;
  else if (!p.onSurface) flap = -0.6 + Math.sin(t * 18 + id) * 0.3;
  else flap = Math.sin(t * 10 + id) * 0.3 * moving + Math.sin(t * 2.5 + id) * 0.08;
  r.wings.forEach((w, i) => (w.rotation.z = (i % 2 === 0 ? 1 : -1) * flap));
}

/** Pick screen camera: a slow turn around your animal, waiting at its base. */
function placeSelectCamera(t: number): void {
  const p = match.players[0];
  const a = p.heading + Math.PI * 0.75 + t * 0.35;
  camPos.set(p.x + Math.sin(a) * 6.2, p.y + 2.6, p.z + Math.cos(a) * 6.2);
  camLook.set(p.x, p.y + 0.5, p.z);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

/** Call outs for crossing into enemy land and for heading home with a flag. */
function watchLands(): void {
  const me = match.players[0];
  const land = landOf(me.z);
  if (land !== lastLand) {
    if (land === 1) hud.call("ENEMY LAND!", TEAMS[1].light);
    else if (land === 0 && me.carrying >= 0) hud.call("HOME STRETCH!", TEAMS[0].color);
    lastLand = land;
  }
}

let baseFov = 60;
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Wider view on short landscape phones so the sides don't feel cramped.
  baseFov = w / h > 1.9 ? 58 : 62;
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let acc = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (hitStop > 0) {
    hitStop -= dt;
  } else if (phase === "play" && !hud.paused) {
    acc += dt;
    while (acc >= STEP) {
      snapshot();
      step(match, humanInput());
      handleEvents();
      acc -= STEP;
    }
    alpha = acc / STEP;
  } else alpha = 1;
  const me = match.players[0];
  if (me.stun <= 0) camYaw += wrapAngle(me.heading - camYaw) * Math.min(1, dt * 2.6);
  shake = Math.max(0, shake - dt * 2.5);
  const t = now / 1000;
  world.update(t, match, camera.position);
  stepFlashes(dt);
  syncViews(t, Math.max(dt, 1 / 240));
  fx.update(dt);
  if (phase === "select") placeSelectCamera(t);
  else placeCamera(Math.min(1, dt * 7));
  // The view widens a little with speed and more on Turbo, for a rush.
  const wantFov = phase === "play" ? baseFov + Math.min(6, me.speed * 0.3) + (me.turboT > 0 ? 5 : 0) : baseFov;
  if (Math.abs(wantFov - camera.fov) > 0.05) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  if (phase === "play") watchLands();
  hud.update(match, controls, camYaw);
  renderer.render(scene, camera);

  if (phase === "play" && !match.over) {
    // The music turns frantic for the finish.
    const close = match.mode === "hoard" ? Math.max(...match.scores) >= HOARD_TARGET * 0.85 : match.timeLeft <= 30;
    if (close && music.level !== 2) music.play(2);
  }
  if (phase === "play" && match.over) {
    phase = "results";
    music.stop();
    window.setTimeout(() => {
      if (phase === "results") music.play(0);
    }, 2600);
    // A win throws confetti over the island.
    if (match.scores[0] > match.scores[1]) {
      const me = match.players[0];
      for (let k = 0; k < 4; k++) fx.burst(me.x + (k - 1.5) * 2, me.y + 3, me.z, ["#ffd166", "#ff6b9a", TEAMS[0].color, "#7ee36b", "#ffffff"], 40, 10, 9, 0.3);
    }
    // Pay out points (not for test games with a forced clock or team size).
    const [a, b] = match.scores;
    const award =
      timeParam || params.has("per") ? null : progressStore.award(progress, worldId, match.players[0].score, a > b ? "win" : a === b ? "draw" : "loss");
    if (award) progressStore.save(store, progress);
    hud.showResults(
      match,
      stats,
      award,
      () => {
        freshMatch();
        startCountdown(true);
      },
      () => {
        freshMatch();
        showSelect();
      },
    );
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function freshMatch(): void {
  const lastMap = match.map;
  const lastWorld = match.world;
  match = newMatch(match.rng() * 1e9);
  // A new team size or world means a new island.
  if (match.map !== lastMap || match.world !== lastWorld) {
    world.dispose();
    world = buildWorld(scene, match);
  }
  rebuildViews();
  stats = freshStats();
  camYaw = match.players[0].heading;
  lastLand = landOf(match.players[0].z);
}

let worldPreview = 0;
function showSelect(): void {
  phase = "select";
  music.play(0);
  hud.showSelect(
    humanAnimal,
    { mode, size: mapFor(perTeam).size, medic: humanMedic, difficulty, world: worldId },
    { progress, open: progressStore.unlocked(progress, unlockAll) },
    (id) => {
      unlockAudio();
      if (id !== humanAnimal) sfx.pick();
      swapAnimal(id);
      saveAnimal(id);
    },
    (setup) => {
      const { mode: picked, size, medic } = setup;
      unlockAudio();
      humanMedic = medic;
      saveMedic(medic);
      match.players[0].medic = medic;
      difficulty = setup.difficulty;
      saveDifficulty(difficulty);
      tryLandscape();
      const newSize = params.has("per") && size === mapFor(perTeam).size ? perTeam : size;
      worldId = setup.world;
      saveWorld(worldId);
      mode = picked;
      perTeam = newSize;
      saveMode(mode);
      saveSize(perTeam);
      // Always a fresh match, so the rival who mirrors you rides your animal.
      freshMatch();
      // Swoop from the turntable view to behind your animal.
      startCountdown(false);
    },
    (id) => {
      // Show the world behind the pick screen as you flick through them.
      clearTimeout(worldPreview);
      worldPreview = window.setTimeout(() => {
        if (phase !== "select" || id === match.world.id) return;
        worldId = id;
        freshMatch();
      }, 250);
    },
  );
}

function startCountdown(snap: boolean): void {
  phase = "countdown";
  camYaw = match.players[0].heading;
  if (snap) placeCamera(1);
  hud.countdown(() => {
    phase = "play";
    music.play(1);
    acc = 0;
    controls.throwQueued = false;
    sfx.whistle();
  });
}

showSelect();

function tryLandscape(): void {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    const p = req?.() as unknown as Promise<void> | undefined;
    p?.then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape")).catch(() => {});
  } catch {
    // Fullscreen is a bonus; iPhone Safari does not offer it.
  }
}

const MODE_KEY = "flagcatch.mode";

function loadMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "hoard" || v === "playful" ? v : "capture";
  } catch {
    return "capture";
  }
}

function saveMode(m: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // Private mode: the pick lasts until the page closes.
  }
}

const DIFFICULTY_KEY = "flagcatch.difficulty";

function loadDifficulty(): Difficulty {
  const want = params.get("difficulty");
  if (want === "easy" || want === "medium" || want === "hard") return want;
  try {
    const v = localStorage.getItem(DIFFICULTY_KEY);
    return v === "easy" || v === "hard" ? v : "medium";
  } catch {
    return "medium";
  }
}

function saveDifficulty(d: Difficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, d);
  } catch {
    // Private mode: the pick lasts until the page closes.
  }
}

const MEDIC_KEY = "flagcatch.medic";

function loadMedic(): boolean {
  try {
    return localStorage.getItem(MEDIC_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMedic(on: boolean): void {
  try {
    localStorage.setItem(MEDIC_KEY, on ? "1" : "0");
  } catch {
    // Private mode: the pick lasts until the page closes.
  }
}

const SIZE_KEY = "flagcatch.size";

function loadSize(): number {
  try {
    const v = Number(localStorage.getItem(SIZE_KEY));
    return MAPS.some((m) => m.size === v) ? v : MAPS[0].size;
  } catch {
    return MAPS[0].size;
  }
}

function saveSize(n: number): void {
  try {
    localStorage.setItem(SIZE_KEY, String(n));
  } catch {
    // Private mode: the pick lasts until the page closes.
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo;
}

// Probe handle for tests and debugging.
(window as unknown as { __FC__: unknown }).__FC__ = {
  get match() {
    return match;
  },
  controls,
};

const ANIMAL_KEY = "flagcatch.animal";

function loadAnimal(): string {
  try {
    const v = localStorage.getItem(ANIMAL_KEY) ?? "";
    return ANIMALS[v] ? v : "lion";
  } catch {
    return "lion";
  }
}

function saveAnimal(id: string): void {
  try {
    localStorage.setItem(ANIMAL_KEY, id);
  } catch {
    // Private mode: the pick lasts until the page closes.
  }
}

const WORLD_KEY = "flagcatch.world";

function loadWorld(): string {
  try {
    const v = localStorage.getItem(WORLD_KEY) ?? "";
    return WORLDS.some((w) => w.id === v) ? v : "home";
  } catch {
    return "home";
  }
}

function saveWorld(id: string): void {
  try {
    localStorage.setItem(WORLD_KEY, id);
  } catch {
    // Private mode: the pick lasts until the page closes.
  }
}
