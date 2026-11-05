import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from './geometry';
import { createCloudTexture } from './textures';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

interface CloudSpec {
  position: [number, number, number];
  width: number;
  height: number;
  opacity: number;
}

/**
 * Clouds live entirely behind the play area (z ≤ −4) so they never occlude
 * the UI or the foreground islands. Three bands: high wisps, mid puffs and a
 * low "sea of clouds" the islands float above.
 */
export function Clouds({ count = 34, seed = 7 }: { count?: number; seed?: number }) {
  const reduced = usePrefersReducedMotion();
  const groupRef = useRef<THREE.Group>(null);
  const texture = useMemo(() => createCloudTexture(), []);

  useEffect(() => () => texture.dispose(), [texture]);

  const clouds = useMemo(() => {
    const rand = mulberry32(seed);
    const list: CloudSpec[] = [];

    for (let i = 0; i < count; i++) {
      const band = i % 3;
      const x = (rand() * 2 - 1) * 70;
      const z = -5 - rand() * 48;
      const y = band === 0 ? 7 + rand() * 10 : band === 1 ? -1 + rand() * 6 : -6.6 + rand() * 2.4;
      const width = band === 2 ? 26 + rand() * 30 : 8 + rand() * 15;
      list.push({
        position: [x, y, z],
        width,
        height: Math.max(1, width * (0.4 + rand() * 0.22)),
        opacity: band === 2 ? 0.8 : 0.45 + rand() * 0.4,
      });
    }

    return list;
  }, [count, seed]);

  useFrame((_, delta) => {
    if (reduced || !groupRef.current) return;
    groupRef.current.rotation.y += Math.min(delta, 0.05) * 0.0035;
  });

  return (
    <group ref={groupRef}>
      {clouds.map((cloud, index) => (
        <sprite key={index} position={cloud.position} scale={[cloud.width, cloud.height, 1]}>
          <spriteMaterial
            map={texture}
            transparent
            opacity={cloud.opacity}
            depthWrite={false}
            color="#ffffff"
          />
        </sprite>
      ))}
    </group>
  );
}
