import * as THREE from 'three';

/** Deterministic PRNG so every island is identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface RockOptions {
  /** Radius of the island's grassy top. */
  radius: number;
  /** How far the rocky underside hangs below the top. */
  depth: number;
  seed: number;
  segments?: number;
  rings?: number;
}

const ROCK_TOP = new THREE.Color('#8b6647');
const ROCK_BOTTOM = new THREE.Color('#46301f');

/**
 * Builds the tapered, jagged rock underside of a floating island as a
 * non-indexed, flat-shaded mesh with vertex-coloured strata.
 *
 * Ring 0 sits at y = 0 (hidden by the grass cap); the mesh tapers to a
 * closed tip at y = -depth.
 */
export function createRockGeometry({
  radius,
  depth,
  seed,
  segments = 11,
  rings = 6,
}: RockOptions): THREE.BufferGeometry {
  const rand = mulberry32(seed);

  const ringPoints: THREE.Vector3[][] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const y = -depth * t;
    const taper = Math.pow(1 - t, 1.25);
    const isTip = ring === rings;
    const base = isTip
      ? radius * 0.05
      : radius * (0.1 + 0.9 * taper) * (1 + 0.1 * Math.sin(t * 7 + seed));
    const twist = t * 0.7;

    const points: THREE.Vector3[] = [];
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2 + twist;
      const jitter = isTip ? 1 : 0.76 + rand() * 0.46;
      const r = Math.max(0.02, base * jitter);
      const yJitter = ring === 0 || isTip ? 0 : (rand() - 0.5) * depth * 0.07;
      points.push(new THREE.Vector3(Math.cos(angle) * r, y + yJitter, Math.sin(angle) * r));
    }
    ringPoints.push(points);
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();

  const pushTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const shade = (0.84 + rand() * 0.3) * (1 + 0.1 * Math.sin(t * 9));
    color.copy(ROCK_TOP).lerp(ROCK_BOTTOM, THREE.MathUtils.clamp(t, 0, 1)).multiplyScalar(shade);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };

  for (let ring = 0; ring < rings; ring++) {
    const t = ring / rings;
    const current = ringPoints[ring]!;
    const next = ringPoints[ring + 1]!;
    for (let s = 0; s < segments; s++) {
      const sNext = (s + 1) % segments;
      const a = current[s]!;
      const b = current[sNext]!;
      const c = next[sNext]!;
      const d = next[s]!;
      pushTriangle(a, b, c, t);
      pushTriangle(a, c, d, t);
    }
  }

  // Close the bottom tip so the island is watertight.
  const tip = new THREE.Vector3(0, -depth * 1.02, 0);
  const lastRing = ringPoints[rings]!;
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    pushTriangle(lastRing[s]!, lastRing[sNext]!, tip, 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
