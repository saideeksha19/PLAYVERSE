import { useEffect, useMemo, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRockGeometry, mulberry32 } from './geometry';
import { createScatter } from './scatter';
import { createGlowTexture, createWaterfallTexture } from './textures';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

export interface IslandProps {
  /** Radius of the grassy top disc. */
  radius: number;
  /** Depth of the rocky underside (defaults to 1.25 × radius). */
  depth?: number;
  seed: number;
  position?: [number, number, number];
  rotationY?: number;
  /** Explicit tree positions (x, z) on the grass disc. Random if omitted. */
  treeSpots?: Array<[number, number]>;
  /** How many random trees to grow when `treeSpots` is not provided. */
  treeCount?: number;
  grassCount?: number;
  flowerCount?: number;
  rockCount?: number;
  waterfall?: boolean;
  castShadow?: boolean;
  /** Portal / characters / props placed in island-local space. */
  children?: ReactNode;
}

const TREE_GREENS = ['#3fa85a', '#57c46e', '#2f8f4e', '#6ed98a'];
const FLOWER_COLORS = ['#ff6b68', '#ffd447', '#ffffff', '#ff8fcb', '#b98cff'];

function Tree({
  position,
  scale,
  seed,
  castShadow,
}: {
  position: [number, number, number];
  scale: number;
  seed: number;
  castShadow: boolean;
}) {
  const canopies = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: 4 }, (_, i) => ({
      position: [
        (rand() - 0.5) * 0.34,
        0.62 + i * 0.2,
        (rand() - 0.5) * 0.34,
      ] as [number, number, number],
      radius: 0.44 - i * 0.07,
      color: TREE_GREENS[Math.floor(rand() * TREE_GREENS.length)] ?? '#3fa85a',
    }));
  }, [seed]);

  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.26, 0]} castShadow={castShadow}>
        <cylinderGeometry args={[0.055, 0.09, 0.55, 6]} />
        <meshStandardMaterial color="#7a5230" flatShading roughness={1} />
      </mesh>
      {canopies.map((canopy, index) => (
        <mesh key={index} position={canopy.position} castShadow={castShadow}>
          <icosahedronGeometry args={[canopy.radius, 1]} />
          <meshStandardMaterial color={canopy.color} flatShading roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** Cascading water off the island edge, with a mist puff where it fades out. */
function Waterfall({ radius, seed }: { radius: number; seed: number }) {
  const reduced = usePrefersReducedMotion();
  const streaks = useMemo(() => createWaterfallTexture(seed), [seed]);
  const mist = useMemo(() => createGlowTexture(128), []);

  useEffect(
    () => () => {
      streaks.dispose();
      mist.dispose();
    },
    [streaks, mist],
  );

  useFrame((_, delta) => {
    if (reduced) return;
    streaks.offset.y -= Math.min(delta, 0.05) * 0.5;
  });

  const width = Math.min(1.1, radius * 0.38);
  const drop = Math.min(5.5, radius * 1.9);

  return (
    <group position={[radius * 0.58, -0.12, radius * 0.76]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, -drop / 2, 0]} renderOrder={2}>
        <planeGeometry args={[width, drop]} />
        <meshStandardMaterial
          map={streaks}
          transparent
          opacity={0.92}
          depthWrite={false}
          side={THREE.DoubleSide}
          color="#e8f8ff"
          roughness={0.25}
        />
      </mesh>
      <sprite position={[0, -drop + 0.15, 0]} scale={[width * 2.4, width * 1.3, 1]}>
        <spriteMaterial map={mist} color="#ffffff" transparent opacity={0.5} depthWrite={false} />
      </sprite>
    </group>
  );
}

/**
 * A complete floating island: jagged flat-shaded rock, overhanging grass cap,
 * soil rim, instanced grass/flowers/rocks, trees and an optional waterfall.
 */
export function Island({
  radius,
  depth = radius * 1.25,
  seed,
  position = [0, 0, 0],
  rotationY = 0,
  treeSpots,
  treeCount = 2,
  grassCount = 46,
  flowerCount = 20,
  rockCount = 7,
  waterfall = false,
  castShadow = true,
  children,
}: IslandProps) {
  const rockGeometry = useMemo(
    () => createRockGeometry({ radius, depth, seed }),
    [radius, depth, seed],
  );
  const grassGeometry = useMemo(
    () => new THREE.CylinderGeometry(radius * 1.03, radius * 0.99, 0.36, 14),
    [radius],
  );
  const soilGeometry = useMemo(
    () => new THREE.CylinderGeometry(radius * 0.99, radius * 0.9, 0.3, 14),
    [radius],
  );

  const groundMeshes = useMemo(() => {
    const onDisc = (rand: () => number, maxFactor: number) => {
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * radius * maxFactor;
      return [Math.cos(angle) * r, Math.sin(angle) * r] as const;
    };

    const tuftGeometry = new THREE.ConeGeometry(0.05, 0.28, 4);
    tuftGeometry.translate(0, 0.14, 0);
    const tufts = createScatter({
      geometry: tuftGeometry,
      material: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
      count: grassCount,
      seed: seed + 11,
      place: (_index, rand, transform, color) => {
        const [x, z] = onDisc(rand, 0.92);
        transform.position.set(x, 0, z);
        transform.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI * 2, (rand() - 0.5) * 0.4);
        const scale = 0.7 + rand() * 0.9;
        transform.scale.set(scale, scale * (0.75 + rand() * 0.8), scale);
        color.setHSL(0.3 + rand() * 0.08, 0.55, 0.36 + rand() * 0.2);
      },
    });

    const flowers = createScatter({
      geometry: new THREE.SphereGeometry(0.05, 6, 5),
      material: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
      count: flowerCount,
      seed: seed + 23,
      place: (_index, rand, transform, color) => {
        const [x, z] = onDisc(rand, 0.88);
        transform.position.set(x, 0.05 + rand() * 0.07, z);
        transform.rotation.set(rand() * Math.PI, rand() * Math.PI * 2, 0);
        transform.scale.setScalar(0.7 + rand() * 0.8);
        color.set(FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)] ?? '#ffffff');
      },
    });

    const pebbles = createScatter({
      geometry: new THREE.IcosahedronGeometry(0.09, 0),
      material: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }),
      count: rockCount,
      seed: seed + 37,
      place: (_index, rand, transform, color) => {
        const [x, z] = onDisc(rand, 0.95);
        transform.position.set(x, 0.02, z);
        transform.rotation.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI);
        transform.scale.set(0.6 + rand() * 1.2, 0.4 + rand() * 0.7, 0.6 + rand() * 1.2);
        color.setHSL(0.08, 0.1, 0.32 + rand() * 0.22);
      },
    });

    return [tufts, flowers, pebbles];
  }, [radius, seed, grassCount, flowerCount, rockCount]);

  const trees = useMemo(() => {
    if (treeSpots) {
      return treeSpots.map(([x, z], index) => ({
        position: [x, 0, z] as [number, number, number],
        scale: 0.85 + ((index * 37) % 7) * 0.05,
        seed: seed * 31 + index,
      }));
    }
    const rand = mulberry32(seed + 101);
    return Array.from({ length: treeCount }, (_, index) => {
      const angle = rand() * Math.PI * 2;
      const r = radius * (0.15 + rand() * 0.5);
      return {
        position: [Math.cos(angle) * r, 0, Math.sin(angle) * r] as [number, number, number],
        scale: 0.75 + rand() * 0.6,
        seed: seed * 31 + index,
      };
    });
  }, [treeSpots, treeCount, radius, seed]);

  useEffect(
    () => () => {
      rockGeometry.dispose();
      grassGeometry.dispose();
      soilGeometry.dispose();
      for (const mesh of groundMeshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.dispose();
      }
    },
    [rockGeometry, grassGeometry, soilGeometry, groundMeshes],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Rocky underside */}
      <mesh geometry={rockGeometry} castShadow={castShadow} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={0.96} metalness={0} />
      </mesh>

      {/* Grass cap */}
      <mesh
        geometry={grassGeometry}
        position={[0, -0.18, 0]}
        castShadow={castShadow}
        receiveShadow
      >
        <meshStandardMaterial color="#4fbf6a" flatShading roughness={0.9} />
      </mesh>

      {/* Soil rim */}
      <mesh geometry={soilGeometry} position={[0, -0.51, 0]} castShadow={castShadow} receiveShadow>
        <meshStandardMaterial color="#7a5533" flatShading roughness={1} />
      </mesh>

      {groundMeshes.map((mesh, index) => (
        <primitive key={`detail-${index}`} object={mesh} />
      ))}

      {trees.map((tree, index) => (
        <Tree
          key={`tree-${index}`}
          position={tree.position}
          scale={tree.scale}
          seed={tree.seed}
          castShadow={castShadow}
        />
      ))}

      {waterfall ? <Waterfall radius={radius} seed={seed + 5} /> : null}

      {children}
    </group>
  );
}
