import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorldFallback } from './WorldFallback';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useDeviceTier } from '../hooks/useDeviceTier';

/**
 * Feature-detects WebGL before mounting the renderer. jsdom (unit tests) and
 * locked-down browsers fall through to the CSS sky automatically.
 */
function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (typeof window.WebGLRenderingContext === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    if (!context) return false;

    const loseContext = context.getExtension('WEBGL_lose_context');
    loseContext?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Fires exactly once, the first time a frame renders *with the scene graph
 * mounted*. `useFrame` only runs inside an actual render pass (including
 * `frameloop: 'demand'` advances), so this is a truthful "the scene has been
 * rendered" signal — unlike timer or rAF guesses.
 */
function FrameSignal({ active, onRendered }: { active: boolean; onRendered: () => void }) {
  const signalled = useRef(false);
  const callback = useRef(onRendered);
  callback.current = onRendered;

  useFrame(() => {
    if (active && !signalled.current) {
      signalled.current = true;
      callback.current();
    }
  });

  return null;
}

/**
 * Full-bleed 3D background shared by every screen.
 *
 * The canvas mounts as soon as this module loads (fast WebGL startup); the
 * scene chunk loads afterwards without blocking it, so nothing preloads in
 * parallel with first paint. Until the scene has produced a real rendered
 * frame (FrameSignal), the designed CSS sky overlay covers the canvas — the
 * flat `#bfe6ff` clear colour is never exposed. Once frames include the
 * scene, the overlay crossfades away.
 */
export function WorldBackground() {
  const [supported] = useState(isWebGLAvailable);
  const [contextLost, setContextLost] = useState(false);
  const [Scene, setScene] = useState<ComponentType | null>(null);
  const [sceneRendered, setSceneRendered] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const reduced = usePrefersReducedMotion();
  const tier = useDeviceTier();

  // Scene chunk loads after the canvas is up; gated so jsdom (no WebGL)
  // never pays for three.js's scene graph in unit tests.
  useEffect(() => {
    if (!supported || contextLost) return;
    let alive = true;
    void import('./WorldScene')
      .then((module) => {
        if (alive) setScene(() => module.default);
      })
      .catch(() => {
        // Scene failed to load — the CSS sky overlay stays in place.
      });
    return () => {
      alive = false;
    };
  }, [supported, contextLost]);

  // Reveal only after FrameSignal observed a real scene render AND that
  // frame has been composited (two rAFs), so the crossfade never exposes
  // the flat clear colour.
  useEffect(() => {
    if (!sceneRendered) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [sceneRendered]);

  if (!supported || contextLost) {
    return <WorldFallback />;
  }

  return (
    <div className="absolute inset-0 bg-[#bfe6ff]">
      <div className="absolute inset-0">
        <Canvas
          flat
          shadows={tier === 'high' ? { type: THREE.PCFShadowMap } : false}
          dpr={[1, tier === 'high' ? 1.5 : 1.25]}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            // Enables reliable canvas readback (drawImage/toDataURL) used by
            // E2E pixel assertions across browser compositing implementations.
            preserveDrawingBuffer: true,
          }}
          camera={{ fov: 42, near: 0.1, far: 400, position: [0, 2.6, 11] }}
          frameloop={reduced ? 'demand' : 'always'}
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color('#bfe6ff'));
            gl.domElement.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              setContextLost(true);
            });
          }}
        >
          {Scene ? <Scene /> : null}
          <FrameSignal active={Boolean(Scene)} onRendered={() => setSceneRendered(true)} />
        </Canvas>
      </div>

      {/* Designed sky covers the canvas until the scene has real frames. */}
      <div
        className={[
          'absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none',
          revealed ? 'pointer-events-none opacity-0' : 'opacity-100',
        ].join(' ')}
      >
        <WorldFallback />
      </div>
    </div>
  );
}
