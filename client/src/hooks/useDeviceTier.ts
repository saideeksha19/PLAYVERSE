import { useState } from 'react';

export type DeviceTier = 'high' | 'low';

/**
 * Coarse device-tier heuristic used to scale the 3D scene:
 * `low` disables shadows, clamps DPR and halves cloud/island counts.
 */
export function detectDeviceTier(): DeviceTier {
  if (typeof navigator === 'undefined') return 'high';

  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
  const coarsePointer =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;

  if (cores <= 3) return 'low';
  // Modern phones report many cores, so lean on pointer + pixel ratio too.
  if (coarsePointer && (cores <= 6 || dpr >= 2.5)) return 'low';
  return 'high';
}

export function useDeviceTier(): DeviceTier {
  const [tier] = useState<DeviceTier>(detectDeviceTier);
  return tier;
}
