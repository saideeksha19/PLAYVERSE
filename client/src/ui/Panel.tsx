import type { HTMLAttributes, ReactNode } from 'react';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** `glass` = dark translucent game panel, `light` = soft-white content card. */
  tone?: 'glass' | 'light';
  /** Apply default padding (disable when the panel wraps its own padded children). */
  padded?: boolean;
  children?: ReactNode;
}

export function Panel({
  tone = 'glass',
  padded = true,
  className = '',
  children,
  ...rest
}: PanelProps) {
  return (
    <div
      className={[
        'pv-panel',
        tone === 'light' ? 'pv-panel--light' : '',
        padded ? 'p-5 sm:p-6' : '',
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
