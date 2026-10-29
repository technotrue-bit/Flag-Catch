/**
 * Crowds. Only the animals nearest the camera get their full, moving rig
 * (six to twelve draws each). The rest are drawn in batches: every animal of
 * a kind and team out to TOKEN_RANGE in one draw, in its resting shape but
 * still leaning, bouncing and squashing with its body; and everything
 * beyond that as tiny stand-ins in its main color, all in one draw. So a
 * crowd of sixty costs a couple of dozen draws, not six hundred.
 */
import * as THREE from "three";
import { type AnimalRig, animalMat } from "./critters";
import { RAMP } from "./models";

/** Past this far from the camera an animal is a tiny stand-in. */
export const TOKEN_RANGE = 55;

const tokenGeo = new THREE.IcosahedronGeometry(0.5, 1);
const tokenMat = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP });

export class Crowd {
  private batches = new Map<string, { mesh: THREE.InstancedMesh; n: number }>();
  private tokens: THREE.InstancedMesh;
  private nTokens = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private pos = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private scene: THREE.Scene) {
    this.tokens = new THREE.InstancedMesh(tokenGeo, tokenMat, 256);
    this.tokens.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Made now: adding colors later would change the shader mid match.
    this.tokens.setColorAt(0, new THREE.Color());
    this.tokens.count = 0;
    this.tokens.frustumCulled = false;
    scene.add(this.tokens);
  }

  /** One batch per kind and team in the match: any rig of it, and how many there are. */
  rebuild(kinds: Map<string, { rig: AnimalRig; count: number }>): void {
    for (const b of this.batches.values()) {
      this.scene.remove(b.mesh);
      b.mesh.dispose();
    }
    this.batches.clear();
    for (const [key, { rig, count }] of kinds) {
      const mesh = new THREE.InstancedMesh(rig.far, animalMat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      // The batch spans the island; the GPU drops what's off screen.
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.batches.set(key, { mesh, n: 0 });
    }
  }

  begin(): void {
    for (const b of this.batches.values()) b.n = 0;
    this.nTokens = 0;
  }

  /** Draw `rig`'s kind at its root and body pose (both already set for this frame). */
  body(key: string, rig: AnimalRig): void {
    const b = this.batches.get(key);
    if (!b || b.n >= b.mesh.instanceMatrix.count) return;
    rig.root.updateMatrix();
    rig.body.updateMatrix();
    b.mesh.setMatrixAt(b.n++, this.m.multiplyMatrices(rig.root.matrix, rig.body.matrix));
  }

  /** A tiny stand-in, its size and main color, standing at (x, y, z) facing `heading`. */
  token(rig: AnimalRig, x: number, y: number, z: number, heading: number): void {
    if (this.nTokens >= this.tokens.instanceMatrix.count) return;
    const s = rig.size;
    this.q.setFromAxisAngle(this.up, heading);
    this.m.compose(this.pos.set(x, y + s.y * 0.45, z), this.q, this.scale.set(s.x * 0.8, s.y * 0.9, s.z * 0.8));
    this.tokens.setMatrixAt(this.nTokens, this.m);
    this.tokens.setColorAt(this.nTokens, rig.tint);
    this.nTokens++;
  }

  end(): void {
    for (const b of this.batches.values()) {
      b.mesh.count = b.n;
      b.mesh.instanceMatrix.needsUpdate = true;
    }
    this.tokens.count = this.nTokens;
    this.tokens.instanceMatrix.needsUpdate = true;
    if (this.tokens.instanceColor) this.tokens.instanceColor.needsUpdate = true;
  }
}
