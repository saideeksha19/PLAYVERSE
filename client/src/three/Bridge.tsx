import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mulberry32 } from './geometry';

export interface BridgeProps {
  /** Deck start (island edge). */
  from: [number, number, number];
  /** Deck end (other island edge). */
  to: [number, number, number];
  width?: number;
  /** How far the middle of the span sags below the endpoints. */
  sag?: number;
  plankCount?: number;
  seed?: number;
}

/**
 * Wooden bridge: instanced planks following a sagging quadratic Bézier plus
 * two rope rails. Endpoints are island-edge anchors, so it is always rendered
 * inside the same floating group as the islands it connects.
 */
export function Bridge({
  from,
  to,
  width = 1.1,
  sag = 0.55,
  plankCount = 16,
  seed = 3,
}: BridgeProps) {
  const [fromX, fromY, fromZ] = from;
  const [toX, toY, toZ] = to;

  const built = useMemo(() => {
    const start = new THREE.Vector3(fromX, fromY, fromZ);
    const end = new THREE.Vector3(toX, toY, toZ);
    const middle = start.clone().lerp(end, 0.5);
    middle.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(start, middle, end);

    const rand = mulberry32(seed);

    const plankGeometry = new THREE.BoxGeometry(width, 0.07, 0.26);
    const plankMaterial = new THREE.MeshStandardMaterial({
      color: '#b98a52',
      roughness: 0.9,
      flatShading: true,
    });
    const planks = new THREE.InstancedMesh(plankGeometry, plankMaterial, plankCount);

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; i < plankCount; i++) {
      const t = i / (plankCount - 1);
      const point = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      dummy.position.copy(point);
      dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      dummy.updateMatrix();
      planks.setMatrixAt(i, dummy.matrix);
      tint.setHSL(0.09, 0.36, 0.48 + rand() * 0.16);
      planks.setColorAt(i, tint);
    }
    planks.instanceMatrix.needsUpdate = true;
    if (planks.instanceColor) planks.instanceColor.needsUpdate = true;
    planks.castShadow = true;
    planks.receiveShadow = true;

    const up = new THREE.Vector3(0, 1, 0);
    const perpendicularAt = (t: number, side: number) => {
      const tangent = curve.getTangent(t);
      return new THREE.Vector3()
        .crossVectors(tangent, up)
        .normalize()
        .multiplyScalar((width / 2) * side);
    };
    const buildRope = (side: number) => {
      const points: THREE.Vector3[] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const point = curve.getPoint(t);
        const perpendicular = perpendicularAt(t, side);
        const lift = 0.4 + Math.sin(Math.PI * t) * 0.05;
        points.push(point.clone().add(perpendicular).add(new THREE.Vector3(0, lift, 0)));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 30, 0.03, 5, false);
    };

    // Four mooring posts where the ropes meet each island.
    const postGeometry = new THREE.CylinderGeometry(0.05, 0.065, 0.62, 6);
    const posts: THREE.Vector3[] = [];
    for (const [t, side] of [
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
    ] as const) {
      posts.push(
        curve
          .getPoint(t)
          .add(perpendicularAt(t, side))
          .add(new THREE.Vector3(0, 0.3, 0)),
      );
    }

    return { planks, ropes: [buildRope(1), buildRope(-1)], posts, postGeometry };
  }, [fromX, fromY, fromZ, toX, toY, toZ, width, sag, plankCount, seed]);

  useEffect(
    () => () => {
      built.planks.geometry.dispose();
      (built.planks.material as THREE.Material).dispose();
      built.planks.dispose();
      for (const rope of built.ropes) rope.dispose();
      built.postGeometry.dispose();
    },
    [built],
  );

  return (
    <group>
      <primitive object={built.planks} />
      {built.ropes.map((geometry, index) => (
        <mesh key={`rope-${index}`} geometry={geometry}>
          <meshStandardMaterial color="#8a6a45" roughness={0.95} />
        </mesh>
      ))}
      {built.posts.map((position, index) => (
        <mesh key={`post-${index}`} geometry={built.postGeometry} position={position} castShadow>
          <meshStandardMaterial color="#7c5a3a" flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
