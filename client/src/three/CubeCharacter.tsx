import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import type { Group } from 'three';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

export interface CubeCharacterProps {
  /** Main body colour. */
  color: string;
  /** Feet/arms colour — defaults to the body colour. */
  accent?: string;
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  /** Varies the idle animation phase so a group never bobs in sync. */
  seed?: number;
  castShadow?: boolean;
}

const DARK = '#16233f';

/**
 * The expressive cube characters from the reference art: rounded body,
 * dot eyes with glints, a small smile, stubby arms and feet, idle bob.
 */
export function CubeCharacter({
  color,
  accent,
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
  seed = 0,
  castShadow = true,
}: CubeCharacterProps) {
  const reduced = usePrefersReducedMotion();
  const groupRef = useRef<Group>(null);
  const phase = useMemo(() => seed * 1.73, [seed]);

  useFrame((state) => {
    if (reduced || !groupRef.current) return;
    const t = state.clock.elapsedTime + phase;
    groupRef.current.position.y = position[1] + Math.sin(t * 2.1) * 0.035;
    groupRef.current.rotation.y = rotationY + Math.sin(t * 0.9) * 0.07;
  });

  const limbColor = accent ?? color;

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* Feet */}
      <RoundedBox
        args={[0.2, 0.12, 0.26]}
        radius={0.045}
        smoothness={3}
        position={[-0.14, 0.06, 0.04]}
        castShadow={castShadow}
      >
        <meshStandardMaterial color={limbColor} roughness={0.6} />
      </RoundedBox>
      <RoundedBox
        args={[0.2, 0.12, 0.26]}
        radius={0.045}
        smoothness={3}
        position={[0.14, 0.06, 0.04]}
        castShadow={castShadow}
      >
        <meshStandardMaterial color={limbColor} roughness={0.6} />
      </RoundedBox>

      {/* Body */}
      <RoundedBox
        args={[0.64, 0.58, 0.6]}
        radius={0.14}
        smoothness={4}
        position={[0, 0.4, 0]}
        castShadow={castShadow}
      >
        <meshStandardMaterial color={color} roughness={0.5} metalness={0} />
      </RoundedBox>

      {/* Arms */}
      <RoundedBox
        args={[0.13, 0.24, 0.15]}
        radius={0.05}
        smoothness={3}
        position={[-0.37, 0.4, 0]}
        rotation={[0, 0, 0.2]}
        castShadow={castShadow}
      >
        <meshStandardMaterial color={limbColor} roughness={0.55} />
      </RoundedBox>
      <RoundedBox
        args={[0.13, 0.24, 0.15]}
        radius={0.05}
        smoothness={3}
        position={[0.37, 0.4, 0]}
        rotation={[0, 0, -0.2]}
        castShadow={castShadow}
      >
        <meshStandardMaterial color={limbColor} roughness={0.55} />
      </RoundedBox>

      {/* Eyes */}
      <mesh position={[-0.14, 0.47, 0.3]}>
        <sphereGeometry args={[0.055, 12, 10]} />
        <meshStandardMaterial color={DARK} roughness={0.35} />
      </mesh>
      <mesh position={[0.14, 0.47, 0.3]}>
        <sphereGeometry args={[0.055, 12, 10]} />
        <meshStandardMaterial color={DARK} roughness={0.35} />
      </mesh>

      {/* Eye glints */}
      <mesh position={[-0.155, 0.49, 0.345]}>
        <sphereGeometry args={[0.017, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.125, 0.49, 0.345]}>
        <sphereGeometry args={[0.017, 6, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* Smile */}
      <RoundedBox args={[0.16, 0.05, 0.05]} radius={0.02} smoothness={3} position={[0, 0.29, 0.3]}>
        <meshStandardMaterial color={DARK} roughness={0.4} />
      </RoundedBox>
    </group>
  );
}
