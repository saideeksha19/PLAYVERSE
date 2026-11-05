import type { CSSProperties } from 'react';

export interface ColorSwatchProps {
  /** Hex colour of the tile, as sent by the server. */
  color: string;
  /** Accessible colour name, e.g. "Azure". */
  label: string;
  /** Accessible glyph, e.g. "●". */
  symbol: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: CSSProperties;
}

const SIZES: Record<NonNullable<ColorSwatchProps['size']>, string> = {
  sm: 'h-9 w-9 rounded-lg text-base',
  md: 'h-12 w-12 rounded-xl text-xl',
  lg: 'h-16 w-16 rounded-2xl text-3xl',
  xl: 'h-24 w-24 rounded-[26px] text-5xl sm:h-28 sm:w-28',
};

/**
 * A colour tile.
 *
 * Colour is never the only carrier of meaning: every swatch renders its glyph
 * in a dark ink that keeps contrast on all six palette colours, and exposes
 * the colour's name through its accessible label. A player who cannot see
 * colour at all matches by name and shape.
 */
export function ColorSwatch({ color, label, symbol, size = 'md', className = '', style }: ColorSwatchProps) {
  return (
    <span
      role="img"
      aria-label={`${label} ${symbol}`}
      style={{ backgroundColor: color, ...style }}
      className={[
        'inline-flex shrink-0 items-center justify-center shadow-[inset_0_-4px_0_rgba(5,14,36,0.22),0_6px_16px_rgba(5,14,36,0.35)]',
        SIZES[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden="true" className="font-display font-bold leading-none text-play-ocean">
        {symbol}
      </span>
    </span>
  );
}
