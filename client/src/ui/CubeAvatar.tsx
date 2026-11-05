import type { CSSProperties } from 'react';
import type { Avatar } from '@playverse/shared';

export type CubeAvatarSize = 'sm' | 'md' | 'lg';

export interface CubeAvatarProps {
  avatar: Avatar;
  size?: CubeAvatarSize;
  /** Highlight ring (avatar picker). */
  selected?: boolean;
  className?: string;
}

/**
 * Flat twin of the 3D cube characters: rounded body, dot eyes, small smile.
 * Uses only the shared palette, so picker/lobby/result rosters stay on-brand.
 */
export function CubeAvatar({
  avatar,
  size = 'md',
  selected = false,
  className = '',
}: CubeAvatarProps) {
  const style = {
    '--avatar-body': avatar.color,
    '--avatar-accent': avatar.accent,
  } as CSSProperties;

  return (
    <span
      role="img"
      aria-label={`${avatar.label} cube avatar`}
      style={style}
      className={[
        'pv-avatar',
        `pv-avatar--${size}`,
        selected ? 'ring-4 ring-play-energy ring-offset-2 ring-offset-play-ocean' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="pv-avatar__eye pv-avatar__eye--left" />
      <span className="pv-avatar__eye pv-avatar__eye--right" />
      <span className="pv-avatar__mouth" />
    </span>
  );
}
