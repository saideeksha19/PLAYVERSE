import * as THREE from 'three';
import { mulberry32 } from './geometry';

export interface ScatterOptions {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  count: number;
  seed: number;
  /**
   * Places instance `index`. Must set the transform on `transform` and a
   * colour on `color` every call.
   */
  place: (
    index: number,
    rand: () => number,
    transform: THREE.Object3D,
    color: THREE.Color,
  ) => void;
}

/** Builds a deterministic InstancedMesh with per-instance colour. */
export function createScatter({
  geometry,
  material,
  count,
  seed,
  place,
}: ScatterOptions): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  const rand = mulberry32(seed);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    place(i, rand, transform, color);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    mesh.setColorAt(i, color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
