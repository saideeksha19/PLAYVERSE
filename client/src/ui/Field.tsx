import type { ReactNode } from 'react';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Shared text-input styling for every form-style screen. */
export const inputClasses =
  'w-full rounded-xl border border-white/15 bg-play-cosmic/55 px-4 py-3 ' +
  'text-base font-semibold text-play-soft placeholder:text-play-soft/40 ' +
  'backdrop-blur-md transition-colors focus:border-play-energy/70 ' +
  'focus:outline-none focus:ring-4 focus:ring-play-energy/25 disabled:opacity-50';

/** Label + control + hint stack used by every form-style screen. */
export function Field({ label, htmlFor, hint, children, className = '' }: FieldProps) {
  return (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      <label
        htmlFor={htmlFor}
        className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-play-soft/75"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs font-semibold text-play-soft/60">{hint}</p> : null}
    </div>
  );
}
