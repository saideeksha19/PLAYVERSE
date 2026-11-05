import type { ComponentType, SVGProps } from 'react';
import { GAME_IDS, MAX_PLAYERS, MIN_PLAYERS, TOTAL_ROUNDS } from '@playverse/shared';
import {
  IconDevice,
  IconGamepad,
  IconJoystick,
  IconTrophy,
  IconUsers,
} from '../../ui/icons';

interface Feature {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  subtitle: string;
}

/** Values come from `@playverse/shared` so the marketing claims can't drift. */
const FEATURES: readonly Feature[] = [
  { icon: IconUsers, title: `${MIN_PLAYERS}–${MAX_PLAYERS}`, subtitle: 'Players' },
  { icon: IconDevice, title: 'Any Device', subtitle: 'Phone · Tablet · Laptop' },
  { icon: IconGamepad, title: 'No Login', subtitle: 'No Install' },
  { icon: IconJoystick, title: `${GAME_IDS.length} Mini-Games`, subtitle: 'Family Friendly' },
  { icon: IconTrophy, title: `${TOTAL_ROUNDS} Rounds`, subtitle: 'New Challenge Each Round' },
];

export function FeatureBar({ className = '' }: { className?: string }) {
  return (
    <ul
      className={[
        'flex flex-wrap items-start justify-start gap-2 md:justify-end md:gap-2.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {FEATURES.map(({ icon: Icon, title, subtitle }) => (
        <li
          key={title}
          className="flex items-center gap-2 rounded-full border border-white/12 bg-play-cosmic/70 py-1.5 pl-2 pr-3.5 shadow-[0_6px_18px_rgba(5,12,30,0.35)] backdrop-blur-md"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-play-energy">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-[11px] font-semibold uppercase tracking-wider text-play-soft">
              {title}
            </span>
            <span className="block text-[10px] font-semibold text-play-soft/70">{subtitle}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
