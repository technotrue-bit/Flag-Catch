/**
 * The globe: the island is drawn as if it sat on a small round planet. Every
 * point dips below the flat ground by BEND times the square of its distance
 * from the camera, so the land rolls gently away and a horizon forms a
 * hundred meters or so out, the way it would on a toy world.
 *
 * That horizon is what makes crowds cheap: anything wholly beyond it can't
 * be seen, so it isn't drawn at all (see `overHorizon`).
 *
 * The dip is done in one place for every material, three.js's shared
 * `project_vertex` step, so nothing needs its own shader. It only moves where
 * things are drawn, never where they are: lighting, shadows and the game all
 * still work on the flat island. The sun's shadow pass (the depth material)
 * is left flat on purpose, so shadows still line up: each point looks up its
 * shadow from its flat position.
 *
 * Pure apart from the shader patch, so the tests can run the sums.
 */
import * as THREE from "three";

/** How sharply the world curves away: meters of dip per meter squared of distance. */
export const BEND = 0.0015;

/** How far below the flat ground a point this far from the camera is drawn. */
export function dip(dx: number, dz: number): number {
  return BEND * (dx * dx + dz * dz);
}

/**
 * True when something whose top is at height `top`, `d` meters out across
 * the ground, is hidden below the horizon seen from an eye at height `eyeY`.
 *
 * The horizon worked out here is the one the sea would make (the lowest
 * ground there is). Real land stands higher and hides more, so this never
 * hides anything that could have been seen.
 */
export function overHorizon(eyeY: number, d: number, top: number, sea = 0): boolean {
  const h = Math.max(0.5, eyeY - sea);
  // Nothing nearer than the horizon itself is behind it.
  if (d * d <= h / BEND) return false;
  // How far below level the horizon is seen, against how far the top is.
  const horizon = -2 * Math.sqrt(h * BEND);
  const seen = (top - eyeY - BEND * d * d) / d;
  return seen < horizon - 0.004;
}

/**
 * How far to sink a pin at height `y`, `d` meters out: with the globe like
 * everything else, but never below the horizon line, so the pin over a flag
 * past the horizon rides along it and still shows which way to go.
 */
export function pinDip(eyeY: number, d: number, y: number, sea = 0): number {
  const h = Math.max(0.5, eyeY - sea);
  const atHorizon = y - eyeY + 2 * Math.sqrt(h * BEND) * d;
  return Math.max(0, Math.min(BEND * d * d, atHorizon));
}

let patched = false;
/** Bend every material. Called once, before anything is drawn. */
export function curveTheWorld(): void {
  if (patched) return;
  patched = true;
  THREE.ShaderChunk.project_vertex = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
#ifdef DEPTH_PACKING
	// The sun's shadow pass stays flat, so shadows line up with the flat lookup.
	mvPosition = modelViewMatrix * mvPosition;
#else
	{
		// The globe: dip by the square of the distance from the camera.
		vec2 globeD = ( modelMatrix * mvPosition ).xz - cameraPosition.xz;
		mvPosition = modelViewMatrix * mvPosition;
		mvPosition.xyz -= ( viewMatrix * vec4( 0.0, ${BEND.toFixed(6)} * dot( globeD, globeD ), 0.0, 0.0 ) ).xyz;
	}
#endif
gl_Position = projectionMatrix * mvPosition;
`;
}
