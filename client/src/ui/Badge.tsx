import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'dark' | 'energy' | 'portal' | 'forest' | 'coral' | 'sky' | 'light';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children?: ReactNode;
}

const TONES: Record<BadgeTone, string> = {
  dark: 'bg-play-cosmic/85 text-play-soft border-white/15',
  energy: 'bg-play-energy text-play-ocean border-white/40',
  portal: 'bg-play-portal text-white border-white/30',
  forest: 'bg-play-forest text-[#06301C] border-white/30',
  coral: 'bg-play-coral text-[#3B0F0E] border-white/30',
  sky: 'bg-play-sky text-play-ocean border-white/40',
  light: 'bg-white/92 text-play-ocean border-play-ocean/15',
};

export function Badge({ tone = 'dark', className = '', children, ...rest }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5',
        'font-display text-[11px] font-semibold uppercase tracking-[0.14em]',
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
