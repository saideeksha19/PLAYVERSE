import type { HTMLAttributes, ReactNode } from 'react';

export type NoticeTone = 'info' | 'success' | 'warning';

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: NoticeTone;
  children?: ReactNode;
}

const TONES: Record<NoticeTone, string> = {
  info: 'border-play-portal/45 bg-play-portal/18 text-play-soft',
  success: 'border-play-forest/50 bg-play-forest/18 text-play-soft',
  warning: 'border-play-energy/55 bg-play-energy/15 text-play-soft',
};

/** Short inline message used for phase gating and feedback. */
export function Notice({ tone = 'info', className = '', children, ...rest }: NoticeProps) {
  return (
    <div
      role="status"
      className={[
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold leading-relaxed',
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
