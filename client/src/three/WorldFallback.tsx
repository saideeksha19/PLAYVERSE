import type { CSSProperties } from 'react';

/**
 * Graceful WebGL fallback: a layered CSS sky with sun glow, blurred clouds,
 * island silhouettes and a portal ring. Purely decorative (aria-hidden) —
 * every interactive element stays HTML and keeps working without WebGL.
 */
export function WorldFallback() {
  return (
    <div data-testid="world-fallback" aria-hidden="true" className="pv-fallback-sky absolute inset-0 overflow-hidden">
      {/* Cloud blobs */}
      <div className="absolute left-[6%] top-[14%] h-24 w-72 rounded-full bg-white/70 blur-2xl" />
      <div className="absolute right-[8%] top-[26%] h-28 w-80 rounded-full bg-white/60 blur-2xl" />
      <div className="absolute left-[28%] top-[52%] h-20 w-64 rounded-full bg-white/45 blur-2xl" />
      <div className="absolute bottom-[6%] left-0 h-44 w-full rounded-full bg-white/75 blur-3xl" />

      {/* Distant island */}
      <div
        className="pv-fallback-island"
        style={
          {
            '--island-x': '64%',
            '--island-y': '30%',
            '--island-w': '150px',
          } as CSSProperties
        }
      >
        <div className="pv-fallback-island__grass" />
        <div className="pv-fallback-island__rock" />
      </div>

      {/* Hero island */}
      <div
        className="pv-fallback-island"
        style={
          {
            '--island-x': '58%',
            '--island-y': '56%',
            '--island-w': '320px',
          } as CSSProperties
        }
      >
        <div className="pv-fallback-island__grass" />
        <div className="pv-fallback-island__rock" />
      </div>

      {/* Portal glow */}
      <div
        className="absolute rounded-full"
        style={{
          left: '62%',
          top: '44%',
          width: '150px',
          height: '150px',
          background:
            'radial-gradient(circle, rgba(190,225,255,0.95) 0%, rgba(118,88,245,0.75) 42%, rgba(118,88,245,0.18) 66%, rgba(118,88,245,0) 78%)',
          boxShadow: '0 0 90px 30px rgba(118,88,245,0.45)',
        }}
      />
    </div>
  );
}
