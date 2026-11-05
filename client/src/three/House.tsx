/**
 * Fairytale cottage seen on the reference's house island: cream walls, a
 * steep red pyramid roof, chimney, door and glowing windows.
 */
export function House({
  position = [0, 0, 0],
  rotationY = 0,
  scale = 1,
}: {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* Walls */}
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.1, 1.2]} />
        <meshStandardMaterial color="#f6e7c9" flatShading roughness={0.9} />
      </mesh>

      {/* Roof */}
      <mesh position={[0, 1.42, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.32, 0.85, 4]} />
        <meshStandardMaterial color="#e2574c" flatShading roughness={0.85} />
      </mesh>

      {/* Chimney */}
      <mesh position={[0.52, 1.78, -0.28]} castShadow>
        <boxGeometry args={[0.22, 0.62, 0.22]} />
        <meshStandardMaterial color="#b07c70" flatShading roughness={1} />
      </mesh>

      {/* Door */}
      <mesh position={[0, 0.36, 0.62]} castShadow>
        <boxGeometry args={[0.36, 0.72, 0.08]} />
        <meshStandardMaterial color="#8a5a35" flatShading roughness={0.95} />
      </mesh>

      {/* Windows */}
      <mesh position={[-0.46, 0.7, 0.62]}>
        <boxGeometry args={[0.3, 0.3, 0.08]} />
        <meshStandardMaterial
          color="#9fd8ff"
          emissive="#7ec8ff"
          emissiveIntensity={0.45}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0.46, 0.7, 0.62]}>
        <boxGeometry args={[0.3, 0.3, 0.08]} />
        <meshStandardMaterial
          color="#9fd8ff"
          emissive="#7ec8ff"
          emissiveIntensity={0.45}
          roughness={0.4}
        />
      </mesh>

      {/* Round window in the gable */}
      <mesh position={[0, 1.25, 0.62]}>
        <cylinderGeometry args={[0.14, 0.14, 0.08, 12]} />
        <meshStandardMaterial
          color="#ffe9a8"
          emissive="#ffd447"
          emissiveIntensity={0.35}
          roughness={0.4}
        />
      </mesh>
    </group>
  );
}
