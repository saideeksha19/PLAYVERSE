import type { ReactNode } from 'react';

export type ScrimVariant = 'left' | 'center' | 'none';

export interface ScreenShellProps {
  children: ReactNode;
  className?: string;
  /**
   * Contrast treatment over the 3D world:
   * `left` = Home's directional gradient, `center` = soft vignette behind
   * a centred panel, `none` = full-bleed scene.
   */
  scrim?: ScrimVariant;
}

const SCRIMS: Record<ScrimVariant, string> = {
  left: 'bg-[linear-gradient(105deg,rgba(10,23,51,0.88)_0%,rgba(10,23,51,0.58)_30%,rgba(10,23,51,0.12)_56%,rgba(10,23,51,0)_74%)]',
  center:
    'bg-[radial-gradient(130%_105%_at_50%_45%,rgba(10,23,51,0.66)_0%,rgba(10,23,51,0.42)_55%,rgba(10,23,51,0.2)_100%)]',
  none: '',
};

/** Consistent page frame: full height, centred max-width content column. */
export function ScreenShell({
  children,
  className = '',
  scrim = 'center',
}: ScreenShellProps) {
  return (
    <div className={['relative flex min-h-dvh w-full flex-col', className].join(' ')}>
      {scrim !== 'none' ? (
        <div aria-hidden="true" className={`pointer-events-none fixed inset-0 ${SCRIMS[scrim]}`} />
      ) : null}
      <main
        id="main"
        tabIndex={-1}
        className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-12 pt-6 outline-none sm:px-6 sm:pt-8"
      >
        {children}
      </main>
    </div>
  );
}
