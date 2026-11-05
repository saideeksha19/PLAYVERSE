import { useMemo } from 'react';
import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  varying vec3 vDirection;

  void main() {
    vec3 direction = normalize(vDirection);
    float height = direction.y;

    vec3 color = mix(uHorizon, uTop, smoothstep(0.02, 0.6, height));
    color = mix(uBottom, color, smoothstep(-0.28, 0.0, height));

    float alignment = max(dot(direction, uSunDirection), 0.0);
    float disc = smoothstep(0.9975, 0.9992, alignment);
    float halo = pow(alignment, 10.0) * 0.28;
    color += uSunColor * (disc * 1.15 + halo);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Bright fantasy sky: zenith blue → pale horizon → cloud-sea white, with the
 * cinematic sun glow in the upper right (matching the reference framing).
 */
export function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color('#2e8fe8') },
      uHorizon: { value: new THREE.Color('#a9e0ff') },
      uBottom: { value: new THREE.Color('#e6f6ff') },
      uSunDirection: { value: new THREE.Vector3(0.62, 0.5, -1).normalize() },
      uSunColor: { value: new THREE.Color('#fff6d8') },
    }),
    [],
  );

  return (
    <mesh frustumCulled={false}>
      <sphereGeometry args={[220, 32, 20]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
