import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { createGlowTexture } from './textures';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 point = vUv - 0.5;
    float radius = length(point) * 2.0;
    float angle = atan(point.y, point.x);

    float swirl = sin(angle * 3.0 + uTime * 1.7 - radius * 8.0);
    float band = sin(radius * 14.0 - uTime * 2.4);

    vec3 core = vec3(0.44, 0.78, 1.0);
    vec3 edge = vec3(0.46, 0.33, 0.96);
    vec3 color = mix(core, edge, smoothstep(0.08, 1.0, radius));
    color += (swirl * 0.16 + band * 0.09) * (1.0 - radius * 0.55);

    float alpha = (1.0 - smoothstep(0.86, 1.0, radius)) * 0.92;
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface PortalProps {
  position?: [number, number, number];
  scale?: number;
}

/** The glowing blue-purple portal: the visual signature of PLAYVERSE. */
export function Portal({ position = [0, 0, 0], scale = 1 }: PortalProps) {
  const reduced = usePrefersReducedMotion();
  const glowTexture = useMemo(() => createGlowTexture(), []);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const haloRef = useRef<THREE.Sprite>(null);

  useEffect(() => () => glowTexture.dispose(), [glowTexture]);

  useFrame((state) => {
    if (reduced) return;
    const elapsed = state.clock.elapsedTime;
    uniforms.uTime.value = elapsed;
    if (haloRef.current) {
      const pulse = 1 + Math.sin(elapsed * 1.6) * 0.05;
      haloRef.current.scale.setScalar(5.4 * pulse);
    }
  });

  return (
    <group position={position} scale={scale}>
      {/* Stone ring */}
      <mesh castShadow>
        <torusGeometry args={[1.05, 0.17, 14, 44]} />
        <meshStandardMaterial
          color="#3b2a8f"
          emissive="#7658f5"
          emissiveIntensity={1.05}
          roughness={0.35}
          metalness={0.1}
          flatShading
        />
      </mesh>

      {/* Swirling energy disc */}
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[1.03, 48]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* Additive halo */}
      <sprite ref={haloRef} position={[0, 0, -0.18]} scale={[5.4, 5.4, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#7658f5"
          transparent
          opacity={0.42}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      <pointLight color="#7658f5" intensity={16} distance={10} decay={2} position={[0, 0, 0.8]} />

      <Sparkles
        count={26}
        scale={[3.6, 3.6, 1]}
        size={5}
        speed={reduced ? 0 : 0.35}
        noise={0.5}
        color="#c9bcff"
      />
    </group>
  );
}
