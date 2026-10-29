/**
 * How the game is drawn at each Graphics setting.
 *
 *   Low     drawn at 1x, fewer sparks and scenery, for older phones.
 *   Normal  the classic look, as sharp as the screen allows up to 2x.
 *   High    soft sun shadows, a glow on bright things (the sun, lava, your
 *           arrow), a gentle color grade and vignette, a sky dome with a sun,
 *           reflective water, swaying grass and rounder trees.
 *
 * The scenery side of High (water, grass, sky, tree detail) is in world.ts,
 * which reads `sceneryFor`; this file owns the renderer and the passes.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { Graphics } from "./settings";

/** What the scenery builds at a Graphics level. */
export interface Scenery {
  level: Graphics;
  /** Trees, flowers and props compared with Normal. */
  density: number;
  /** Rounder trees and rocks. */
  smooth: boolean;
  /** Reflective, rippling water and glowing, flowing lava. */
  richWater: boolean;
  /** A sky dome with a sun in place of the flat backdrop. */
  skyDome: boolean;
  /** Swaying grass tufts on green worlds. */
  grass: boolean;
  /** Sun shadows: things cast and receive them. */
  shadows: boolean;
}

export function sceneryFor(level: Graphics): Scenery {
  const high = level === "high";
  return {
    level,
    density: level === "low" ? 0.55 : high ? 1.15 : 1,
    smooth: high,
    richWater: high,
    skyDome: high,
    grass: high,
    shadows: high,
  };
}

/** The sharpest pixel ratio each level draws at, before the frame rate safety net. */
export function maxPixelRatio(level: Graphics, device: number): number {
  const d = device || 1;
  // High spends its time on shadows and glow, not on more pixels than Normal:
  // every full screen pass costs as much again at each step of sharpness.
  return level === "low" ? 1 : Math.min(2, d);
}

/**
 * The last pass: from the scene's linear light to screen colors, then a soft
 * color grade and vignette. One pass in place of two, which matters at 2x.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.2 },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.05 },
    uWarm: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uWarm;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 lin = max(c.rgb, 0.0);
      c.rgb = mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 col = mix(vec3(l), c.rgb, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      // A touch of sunshine in the light parts, a touch of blue in the shade.
      col += vec3(uWarm, uWarm * 0.4, -uWarm) * (l - 0.35);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.15, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export interface Look {
  readonly level: Graphics;
  /** Switch levels: shadows, passes and sharpness. Returns the new top pixel ratio. */
  set(level: Graphics): number;
  setSize(w: number, h: number): void;
  setPixelRatio(r: number): void;
  /** Snowy worlds are bright all over: only the brightest things glow there. */
  setBright(bright: boolean): void;
  /**
   * The phone can't keep 60 even at High's lowest sharpness: give up the next
   * costliest extra (the glow, then drawing shadows every frame). False when
   * there is nothing left to give up.
   */
  trim(): boolean;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

export function createLook(renderer: THREE.WebGLRenderer): Look {
  let level: Graphics = "normal";
  let composer: EffectComposer | null = null;
  let renderPass: RenderPass | null = null;
  let bloom: UnrealBloomPass | null = null;
  const size = new THREE.Vector2(1, 1);
  let bright = false;
  const threshold = () => (bright ? 2.2 : 1.02);
  /** How many of High's extras have been given up to hold 60 (see trim). */
  let trims = 0;
  let frame = 0;
  // Plain PCF with a blur radius: soft enough, at a fraction of PCFSoft's taps.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const build = () => {
    renderer.getSize(size);
    // Lightly multisampled, so edges stay smooth with the passes on.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 2 });
    composer = new EffectComposer(renderer, target);
    renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    composer.addPass(renderPass);
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.35, threshold());
    // The glow is soft anyway, so it's worked out at half the size it would
    // be: a quarter of the pixels in each of its blur passes.
    const bloomSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => bloomSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
    composer.addPass(bloom);
    composer.addPass(new ShaderPass(GradeShader));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
  };

  return {
    get level() {
      return level;
    },
    set(next) {
      level = next;
      const high = next === "high";
      trims = 0;
      renderer.shadowMap.enabled = high;
      renderer.shadowMap.autoUpdate = true;
      if (high && !composer) build();
      if (!high && composer) {
        composer.dispose();
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
        bloom?.dispose();
        composer = null;
        renderPass = null;
        bloom = null;
      }
      return maxPixelRatio(next, window.devicePixelRatio);
    },
    setSize(w, h) {
      composer?.setSize(w, h);
    },
    setPixelRatio(r) {
      renderer.setPixelRatio(r);
      if (composer) {
        renderer.getSize(size);
        composer.setPixelRatio(r);
        composer.setSize(size.x, size.y);
      }
    },
    setBright(next) {
      bright = next;
      if (bloom) bloom.threshold = threshold();
    },
    trim() {
      if (level !== "high" || trims >= 2) return false;
      trims++;
      if (trims === 1 && bloom) bloom.enabled = false;
      // Shadows drawn every other frame: half the sun's work, and at 60 a
      // frame's lag in a shadow is hard to see.
      if (trims === 2) renderer.shadowMap.autoUpdate = false;
      return true;
    },
    render(scene, camera) {
      if (trims >= 2 && renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = frame % 2 === 0;
      frame++;
      if (!composer || !renderPass) {
        renderer.render(scene, camera);
        return;
      }
      renderPass.scene = scene;
      renderPass.camera = camera;
      composer.render();
    },
  };
}
