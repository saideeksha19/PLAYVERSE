import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon node (decorative — the label carries the meaning). */
  icon?: ReactNode;
  fullWidth?: boolean;
}

const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-xl font-display font-semibold tracking-wide ' +
  'select-none transition-[transform,filter,background-color,box-shadow] duration-150 ease-out ' +
  'active:translate-y-[3px] disabled:pointer-events-none disabled:opacity-55 ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-play-energy/60';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-play-energy text-play-ocean shadow-[0_5px_0_var(--color-play-energy-deep)] ' +
    'hover:brightness-[1.06] active:shadow-[0_2px_0_var(--color-play-energy-deep)]',
  secondary:
    'bg-play-azure text-white shadow-[0_5px_0_var(--color-play-azure-deep)] ' +
    'hover:brightness-110 active:shadow-[0_2px_0_var(--color-play-azure-deep)]',
  success:
    'bg-play-forest text-[#06301C] shadow-[0_5px_0_var(--color-play-forest-deep)] ' +
    'hover:brightness-105 active:shadow-[0_2px_0_var(--color-play-forest-deep)]',
  danger:
    'bg-play-coral text-white shadow-[0_5px_0_var(--color-play-coral-deep)] ' +
    'hover:brightness-105 active:shadow-[0_2px_0_var(--color-play-coral-deep)]',
  ghost:
    'bg-white/12 text-play-soft border border-white/20 backdrop-blur-md ' +
    'hover:bg-white/22 shadow-[0_4px_0_rgba(8,18,44,0.45)] active:shadow-[0_1px_0_rgba(8,18,44,0.45)]',
  dark:
    'bg-play-cosmic/85 text-play-soft border border-white/10 ' +
    'hover:bg-play-cosmic shadow-[0_5px_0_rgba(5,12,30,0.6)] active:shadow-[0_2px_0_rgba(5,12,30,0.6)]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'h-12 px-6 text-base',
  lg: 'h-14 px-8 text-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[BASE, VARIANTS[variant], SIZES[size], fullWidth ? 'w-full' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
