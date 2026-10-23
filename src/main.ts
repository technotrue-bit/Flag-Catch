/**
 * FLAG CATCH feel prototype. Three lands in a row (yours, the middle, the
 * enemy's), two teams of four, flags, bases, firecrackers and four animals.
 * Throwaway: it exists to settle movement, camera, thumb controls and throw
 * feel before the real build.
 *
 * Flow: pick your animal, then 3, 2, 1, GO!, then the match, then results.
 */
import * as THREE from "three";
import { ANIMALS } from "./animals";
import { sfx, unlockAudio } from "./audio";
import { Fx } from "./fx";
import { createHud } from "./hud";
import { createControls } from "./input";
import { type AnimalRig, type FlagRig, buildAnimal, buildFlag, toon } from "./models";
import { FLAG_ENEMY, FLAG_FREE, TEAMS } from "./palette";
import { type Input, type Match, NO_INPUT, STEP, createMatch, setAnimal, step, wrapAngle } from "./sim";
import { landOf, surfaceHeight } from "./terrain";
import { buildWorld } from "./world";

const params = new URLSearchParams(location.search);
let humanAnimal = ANIMALS[params.get("animal") ?? ""] ? params.get("animal")! : "lion";
const perTeam = clampInt(Number(params.get("per") ?? 4), 1, 16);
const duration = clampInt(Number(params.get("time") ?? 180), 20, 900);

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 400);

let match: Match = newMatch(Number(params.get("seed") ?? 1));
const world = buildWorld(scene, match.bases);
const fx = new Fx(scene);
const controls = createControls(renderer.domElement);
const hud = createHud(controls);

interface PlayerView {
  rig: AnimalRig;
  ring: THREE.Mesh;
  animal: string;
  bank: number;
  spin: number;
}
let views: PlayerView[] = [];
const flagViews: FlagRig[] = [];
const fireGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.7, 10);
fireGeo.rotateX(Math.PI / 2);
const fireMat = toon("#e8455b");
const fireMeshes = new Map<number, THREE.Mesh>();
const ringGeo = new THREE.CircleGeometry(1.2, 24);
ringGeo.rotateX(-Math.PI / 2);

function newMatch(seed: number): Match {
  return createMatch({ seed, humanAnimal, perTeam, duration, flagsPerTeam: 5 });
}

function rebuildViews(): void {
  for (const v of views) {
    scene.remove(v.rig.root);
    scene.remove(v.ring);
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
}

function makeView(animal: string, team: number, me: boolean): PlayerView {
  const rig = buildAnimal(animal, TEAMS[team].color);
  scene.add(rig.root);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: me ? "#ffffff" : TEAMS[team].color, transparent: true, opacity: me ? 0.75 : 0.5, depthWrite: false }),
  );
  scene.add(ring);
  return { rig, ring, animal, bank: 0, spin: 0 };
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
  const p = match.players[0];
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
  const input: Input = { dirX, dirZ, jump: controls.jump, throwPressed: controls.throwQueued };
  controls.throwQueued = false;
  return input;
}

function handleEvents(): void {
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
        sfx.bank(pan, near);
        fx.burst(e.x, e.y + 1, e.z, ["#ffd166", "#ff6b5b", "#46b4e8", "#7ee36b", "#b3a9ff"], 60, 12, 14, 0.3);
        if (mine) hud.call("YOU SCORED!", TEAMS[0].color);
        else if (e.team === 0) hud.call("TEAM SCORED!", TEAMS[0].color);
        else hud.call("THEY SCORED", TEAMS[1].light);
        break;
      case "splash":
        sfx.splash(pan, near);
        fx.burst(e.x, 0.2, e.z, ["#ffffff", "#bff0f5"], 14, 5, 16, 0.2);
        break;
    }
  }
}

function syncViews(t: number, dt: number): void {
  for (const p of match.players) {
    const v = views[p.id];
    const r = v.rig;
    r.root.position.set(p.x, p.y, p.z);
    r.root.rotation.y = p.heading;
    // Lean into turns and squash on landing.
    const turn = wrapAngle(p.heading - (r.root.userData.lastHeading ?? p.heading)) / dt;
    r.root.userData.lastHeading = p.heading;
    v.bank += (Math.max(-0.45, Math.min(0.45, -turn * 0.12)) - v.bank) * Math.min(1, dt * 8);
    r.body.rotation.z = v.bank;
    const moving = Math.min(1, p.speed / 10);
    r.body.position.y = p.onSurface ? Math.abs(Math.sin(t * 14 + p.id)) * 0.08 * moving : 0;
    r.body.rotation.x = p.onSurface ? 0 : Math.max(-0.4, Math.min(0.4, -p.vy * 0.04));
    if (p.stun > 0) v.spin += dt * 18;
    else v.spin *= 0.8;
    r.body.rotation.y = v.spin;
    for (const w of r.wheels) w.rotation.x += p.speed * dt * 2.5;
    const flap = p.onSurface ? Math.sin(t * 6 + p.id) * 0.15 : Math.sin(t * 16 + p.id) * 0.7;
    r.wings.forEach((w, i) => (w.rotation.z = (i === 0 ? 1 : -1) * flap));
    const surf = surfaceHeight(p.x, p.z);
    v.ring.position.set(p.x, surf + 0.05, p.z);
    const air = p.y - surf;
    v.ring.scale.setScalar(Math.max(0.4, 1 - air * 0.06));
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
      const c = match.players[f.carrier];
      const back = 0.7;
      v.root.position.set(c.x - Math.sin(c.heading) * back, c.y + 1.1, c.z - Math.cos(c.heading) * back);
      v.root.rotation.y = c.heading + Math.PI / 2;
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
      v.root.rotation.y = Math.sin(t * 1.2 + i) * 0.4 + Math.atan2(f.x - match.bases[f.team].x, f.z - match.bases[f.team].z);
      v.root.scale.setScalar(0.85);
      v.glow.visible = true;
      glow.opacity = 0.3;
    }
  });

  const alive = new Set<number>();
  for (const f of match.fires) {
    alive.add(f.id);
    let mesh = fireMeshes.get(f.id);
    if (!mesh) {
      mesh = new THREE.Mesh(fireGeo, fireMat);
      scene.add(mesh);
      fireMeshes.set(f.id, mesh);
    }
    mesh.position.set(f.x, f.y, f.z);
    mesh.rotation.y = Math.atan2(f.vx, f.vz);
    mesh.rotation.x += dt * 12;
    if (Math.random() < 0.5) fx.burst(f.x, f.y + 0.2, f.z, ["#ffd166", "#ff9f1c"], 1, 1.5, 2, 0.14);
  }
  for (const [id, mesh] of fireMeshes) {
    if (!alive.has(id)) {
      scene.remove(mesh);
      fireMeshes.delete(id);
    }
  }
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

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Wider view on short landscape phones so the sides don't feel cramped.
  camera.fov = w / h > 1.9 ? 58 : 62;
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
      step(match, humanInput());
      handleEvents();
      acc -= STEP;
    }
  }
  const me = match.players[0];
  if (me.stun <= 0) camYaw += wrapAngle(me.heading - camYaw) * Math.min(1, dt * 2.6);
  shake = Math.max(0, shake - dt * 2.5);
  const t = now / 1000;
  world.update(t);
  syncViews(t, Math.max(dt, 1 / 240));
  fx.update(dt);
  if (phase === "select") placeSelectCamera(t);
  else placeCamera(Math.min(1, dt * 7));
  if (phase === "play") watchLands();
  hud.update(match, controls, camYaw);
  renderer.render(scene, camera);

  if (phase === "play" && match.over) {
    phase = "results";
    hud.showResults(
      match,
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
  match = newMatch(match.rng() * 1e9);
  rebuildViews();
  camYaw = match.players[0].heading;
  lastLand = landOf(match.players[0].z);
}

function showSelect(): void {
  phase = "select";
  hud.showSelect(
    humanAnimal,
    (id) => {
      unlockAudio();
      if (id !== humanAnimal) sfx.pick();
      swapAnimal(id);
    },
    () => {
      unlockAudio();
      tryLandscape();
      // Swoop from the turntable view to behind your animal.
      startCountdown(false);
    },
  );
}

function startCountdown(snap: boolean): void {
  phase = "countdown";
  camYaw = match.players[0].heading;
  if (snap) placeCamera(1);
  hud.countdown(() => {
    phase = "play";
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
