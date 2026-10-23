/** Pops, confetti and splashes: a small pool of instanced cubes. */
import * as THREE from "three";

const MAX = 600;

interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  spin: number;
  gravity: number;
}

export class Fx {
  private mesh: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#ffffff" }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, colors: readonly string[], count: number, speed: number, gravity = 18, size = 0.28): void {
    for (let i = 0; i < count && this.bits.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.3 + Math.random() * 0.9;
      const s = speed * (0.5 + Math.random() * 0.6);
      const life = 0.5 + Math.random() * 0.5;
      this.bits.push({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: up * s,
        vz: Math.sin(a) * s,
        life,
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        spin: Math.random() * 10,
        gravity,
      });
      this.mesh.setColorAt(this.bits.length - 1, this.color.set(colors[i % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) continue;
      b.vy -= b.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      const k = b.life / b.max;
      this.dummy.position.set(b.x, b.y, b.z);
      this.dummy.rotation.set(b.spin * k, b.spin * k * 0.7, 0);
      this.dummy.scale.setScalar(b.size * (0.4 + 0.6 * k));
      this.dummy.updateMatrix();
      if (n !== i) {
        this.bits[n] = b;
        this.mesh.getColorAt(i, this.color);
        this.mesh.setColorAt(n, this.color);
      }
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      n++;
    }
    this.bits.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
