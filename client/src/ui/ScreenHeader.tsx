import type { ReactNode } from 'react';
import { Button } from './Button';
import { IconArrowLeft } from './icons';

export interface ScreenHeaderProps {
  /** 1–12 from the reference board. */
  index?: number;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

/**
 * Shared screen heading: back control, numbered chip, title and subtitle —
 * mirrors the reference board's numbered screen labels.
 */
export function ScreenHeader({
  index,
  title,
  subtitle,
  badge,
  onBack,
  backLabel = 'Back',
}: ScreenHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-3">
      {onBack ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<IconArrowLeft className="h-4 w-4" />}
            onClick={onBack}
          >
            {backLabel}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center sm:text-left">
        {typeof index === 'number' ? (
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-play-energy font-display text-xl font-bold text-play-ocean shadow-[0_4px_0_var(--color-play-energy-deep)]"
          >
            {index}
          </span>
        ) : null}

        <div className="flex flex-col items-center gap-1 sm:items-start">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            <h1 className="text-3xl text-play-soft drop-shadow-[0_3px_12px_rgba(4,12,34,0.9)] sm:text-4xl">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle ? (
            <p className="font-semibold text-play-soft/75 drop-shadow-[0_2px_8px_rgba(4,12,34,0.9)]">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
