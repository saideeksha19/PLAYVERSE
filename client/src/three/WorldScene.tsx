import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Island } from './Island';
import { Bridge } from './Bridge';
import { Clouds } from './Clouds';
import { House } from './House';
import { Portal } from './Portal';
import { SkyDome } from './SkyDome';
import { CubeCharacter } from './CubeCharacter';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useDeviceTier } from '../hooks/useDeviceTier';
import { getAvatar } from '@playverse/shared';

interface IslandSpec {
  position: [number, number, number];
  radius: number;
  trees: number;
  waterfall?: boolean;
  house?: boolean;
  /** Explicit tree positions on the grass disc (x, z). */
  treeSpots?: Array<[number, number]>;
  /** `sparse` = small rock shards with light vegetation. */
  detail?: 'full' | 'sparse';
}

/* ------------------------------------------------------------------ */
/* Composition — tuned against the reference framing (UI left, world right) */
/* ------------------------------------------------------------------ */

const MAIN_POSITION: [number, number, number] = [2.6, -0.2, 0];
const MAIN_RADIUS = 2.9;
const SIDE_POSITION: [number, number, number] = [-3.8, -1.1, -5.2];
const SIDE_RADIUS = 1.8;
const HOUSE_POSITION: [number, number, number] = [7.0, 3.6, -14];

const MAIN_TREES: Array<[number, number]> = [
  [-2.0, -0.4],
  [1.9, -1.5],
  [-1.0, 2.0],
];
const SIDE_TREES: Array<[number, number]> = [
  [-0.55, 0.35],
  [0.75, -0.5],
];

const BACK_ISLANDS: IslandSpec[] = [
  { position: [-2.4, 2.6, -16], radius: 1.9, trees: 2 },
  { position: [7.6, 3.6, -21], radius: 2.4, trees: 3 },
  { position: [-8.8, 4.4, -26], radius: 3.0, trees: 3 },
  { position: [10.8, -0.8, -12], radius: 1.5, trees: 1 },
  { position: [-6.4, -2.6, -9], radius: 1.4, trees: 1, waterfall: true },
  { position: [1.4, 6.6, -32], radius: 2.2, trees: 2 },
  {
    position: HOUSE_POSITION,
    radius: 2.2,
    trees: 1,
    treeSpots: [[-1.15, 0.7]],
    house: true,
    waterfall: true,
  },
];

/** Small drifting rock shards that fill the mid-ground. */
const ROCK_SHARDS: IslandSpec[] = [
  { position: [6.4, 1.6, -6.5], radius: 0.55, trees: 0, detail: 'sparse' },
  { position: [9.5, 1.4, -17], radius: 0.8, trees: 1, detail: 'sparse' },
  { position: [4.2, 6.4, -18], radius: 0.6, trees: 0, detail: 'sparse' },
  { position: [-5.5, 3.6, -14], radius: 0.5, trees: 0, detail: 'sparse' },
  { position: [-9.5, 0.6, -18], radius: 0.7, trees: 1, detail: 'sparse' },
  { position: [12.5, 4.8, -24], radius: 0.9, trees: 1, detail: 'sparse' },
];

/** Preset avatars used as the world's cast (single source: @playverse/shared). */
const AVATAR = {
  red: getAvatar('red'),
  blue: getAvatar('blue'),
  yellow: getAvatar('yellow'),
  pink: getAvatar('pink'),
  green: getAvatar('green'),
  orange: getAvatar('orange'),
  teal: getAvatar('teal'),
} as const;

/** Point on `from`'s rim looking at `to`, kept at grass height. */
function edgePoint(
  from: [number, number, number],
  to: [number, number, number],
  radius: number,
): [number, number, number] {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz) || 1;
  return [from[0] + (dx / length) * radius, from[1] + 0.05, from[2] + (dz / length) * radius];
}

const BRIDGE_FROM = edgePoint(MAIN_POSITION, SIDE_POSITION, MAIN_RADIUS - 0.05);
const BRIDGE_TO = edgePoint(SIDE_POSITION, MAIN_POSITION, SIDE_RADIUS - 0.05);

/** Keeps the framed camera on the composition at every aspect ratio. */
function CameraRig() {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = width / Math.max(1, height);

    if (aspect < 0.85) {
      // Portrait: pull back and centre on the main island.
      camera.position.set(1.6, 3.2, 15.5);
      camera.lookAt(1.2, 0.6, 0);
    } else if (aspect < 1.3) {
      camera.position.set(0.9, 2.9, 13.2);
      camera.lookAt(0.9, 0.7, 0);
    } else {
      camera.position.set(0, 2.6, 11);
      camera.lookAt(0.6, 0.8, 0);
    }

    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  return null;
}

/** A distant island or shard with its own slow float. */
function FloatingIsland({
  spec,
  seed,
  shadows,
  reduced,
}: {
  spec: IslandSpec;
  seed: number;
  shadows: boolean;
  reduced: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const phase = seed * 0.7;
  const sparse = spec.detail === 'sparse';

  useFrame((state) => {
    if (reduced || !groupRef.current) return;
    const t = state.clock.elapsedTime + phase;
    groupRef.current.position.y = spec.position[1] + Math.sin(t * 0.35) * 0.25;
    groupRef.current.rotation.y = Math.sin(t * 0.12) * 0.05;
  });

  return (
    <group ref={groupRef} position={spec.position}>
      <Island
        radius={spec.radius}
        depth={spec.radius * (sparse ? 1.7 : 1.3)}
        seed={seed}
        treeCount={spec.trees}
        treeSpots={spec.treeSpots}
        grassCount={sparse ? 14 : undefined}
        flowerCount={sparse ? 7 : undefined}
        waterfall={spec.waterfall ?? false}
        castShadow={shadows && !sparse}
      >
        {spec.house ? <House position={[0.55, 0, -0.3]} rotationY={-0.45} /> : null}
      </Island>
    </group>
  );
}

/**
 * The PLAYVERSE world: bright sky, layered clouds, a hero island with the
 * portal and cube characters, a rope bridge to a side island, a cottage on a
 * distant island, drifting rock shards and waterfalls fading into the haze.
 */
export default function WorldScene() {
  const reduced = usePrefersReducedMotion();
  const tier = useDeviceTier();
  const shadows = tier === 'high';
  const nearGroup = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (reduced || !nearGroup.current) return;
    const t = state.clock.elapsedTime;
    nearGroup.current.position.y = Math.sin(t * 0.4) * 0.08;
    nearGroup.current.rotation.z = Math.sin(t * 0.27) * 0.005;
  });

  const cloudCount = tier === 'high' ? 34 : 18;
  const backIslands = tier === 'high' ? BACK_ISLANDS : BACK_ISLANDS.slice(0, 5);
  const shards = tier === 'high' ? ROCK_SHARDS : ROCK_SHARDS.slice(0, 3);

  return (
    <>
      <color attach="background" args={['#bfe6ff']} />
      <fog attach="fog" args={['#c9ebff', 34, 140]} />

      <SkyDome />
      <Clouds count={cloudCount} />

      {/* Cinematic key + warm sky fill + cool rim for separation. */}
      <ambientLight intensity={0.6} color="#d6ecff" />
      <hemisphereLight args={['#9bd4ff', '#4a7a3f', 0.8]} />
      <directionalLight
        castShadow={shadows}
        position={[7, 12, 6]}
        intensity={2.55}
        color="#fff4da"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-normalBias={0.03}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-9, 5, -7]} intensity={0.55} color="#a8d4ff" />

      <CameraRig />

      {/* Hero group: main island + side island + bridge bob together. */}
      <group ref={nearGroup}>
        <Island
          position={MAIN_POSITION}
          radius={MAIN_RADIUS}
          depth={3.6}
          seed={42}
          treeSpots={MAIN_TREES}
          grassCount={70}
          flowerCount={34}
          waterfall
          castShadow={shadows}
        >
          <Portal position={[0.15, 1.28, -1.1]} />
          <CubeCharacter
            color={AVATAR.red.color}
            accent={AVATAR.red.accent}
            position={[-1.5, 0, 1.3]}
            rotationY={0.35}
            seed={1}
            castShadow={shadows}
          />
          <CubeCharacter
            color={AVATAR.blue.color}
            accent={AVATAR.blue.accent}
            position={[0.5, 0, 1.75]}
            rotationY={-0.15}
            seed={2}
            castShadow={shadows}
          />
          <CubeCharacter
            color={AVATAR.yellow.color}
            accent={AVATAR.yellow.accent}
            position={[1.7, 0, 0.5]}
            rotationY={-0.6}
            seed={3}
            castShadow={shadows}
          />
          <CubeCharacter
            color={AVATAR.green.color}
            accent={AVATAR.green.accent}
            position={[-0.5, 0, 0.45]}
            rotationY={0.15}
            seed={5}
            scale={0.92}
            castShadow={shadows}
          />
          <CubeCharacter
            color={AVATAR.orange.color}
            accent={AVATAR.orange.accent}
            position={[1.35, 0, 1.55]}
            rotationY={-0.35}
            seed={6}
            scale={0.95}
            castShadow={shadows}
          />
        </Island>

        <Island
          position={SIDE_POSITION}
          radius={SIDE_RADIUS}
          depth={2.4}
          seed={77}
          treeSpots={SIDE_TREES}
          grassCount={34}
          flowerCount={16}
          castShadow={shadows}
        >
          <CubeCharacter
            color={AVATAR.pink.color}
            accent={AVATAR.pink.accent}
            position={[0.35, 0, 0.75]}
            rotationY={0.4}
            seed={4}
            castShadow={shadows}
          />
          <CubeCharacter
            color={AVATAR.teal.color}
            accent={AVATAR.teal.accent}
            position={[-0.55, 0, -0.35]}
            rotationY={-0.7}
            seed={7}
            scale={0.9}
            castShadow={shadows}
          />
        </Island>

        <Bridge from={BRIDGE_FROM} to={BRIDGE_TO} width={1.05} sag={0.5} plankCount={15} />
      </group>

      {backIslands.map((spec, index) => (
        <FloatingIsland
          key={`back-${index}`}
          spec={spec}
          seed={100 + index * 13}
          shadows={shadows}
          reduced={reduced}
        />
      ))}

      {shards.map((spec, index) => (
        <FloatingIsland
          key={`shard-${index}`}
          spec={spec}
          seed={300 + index * 17}
          shadows={shadows}
          reduced={reduced}
        />
      ))}
    </>
  );
}
