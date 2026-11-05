import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** 2–8 players. */
export function IconUsers(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.6 19a5.4 5.4 0 0 1 10.8 0" />
      <path d="M16 5.4a3.2 3.2 0 0 1 0 5.4" />
      <path d="M17.4 13.8A5.4 5.4 0 0 1 20.4 19" />
    </IconBase>
  );
}

/** Phone / tablet / laptop. */
export function IconDevice(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M8.5 20.5h7" />
      <path d="M12 16.5v4" />
    </IconBase>
  );
}

/** No login, no install. */
export function IconGamepad(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2.5" y="7.5" width="19" height="9.5" rx="4.75" />
      <path d="M7 10.6v3.2M5.4 12.2h3.2" />
      <circle cx="16.2" cy="11.1" r="1" />
      <circle cx="18.6" cy="13.3" r="1" />
    </IconBase>
  );
}

/** Two mini-games. */
export function IconJoystick(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="4.8" r="2" />
      <path d="M12 6.8v6.7" />
      <rect x="4" y="13.5" width="16" height="6.5" rx="2.2" />
      <circle cx="9" cy="16.8" r="1" />
      <circle cx="15" cy="16.8" r="1" />
    </IconBase>
  );
}

/** Five rounds. */
export function IconTrophy(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 4h10v4.2a5 5 0 0 1-10 0V4Z" />
      <path d="M5 5.2H3.4C3.4 8.2 4.9 9.8 7 10.2" />
      <path d="M19 5.2h1.6c0 3-1.5 4.6-3.6 5" />
      <path d="M12 13.2v3.4" />
      <path d="M8.6 20.4h6.8" />
      <path d="M9.8 16.6h4.4v3.8H9.8z" />
    </IconBase>
  );
}

/** Create a room. */
export function IconCreate(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <path d="M12 8.8v6.4M8.8 12h6.4" />
    </IconBase>
  );
}

/** Join a room (invite link). */
export function IconLink(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10.2 13.8a4.4 4.4 0 0 0 6.2 0l2.4-2.4a4.4 4.4 0 1 0-6.2-6.2l-1.3 1.3" />
      <path d="M13.8 10.2a4.4 4.4 0 0 0-6.2 0l-2.4 2.4a4.4 4.4 0 1 0 6.2 6.2l1.3-1.3" />
    </IconBase>
  );
}

/** How to play. */
export function IconBook(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 6.6C10.4 5.1 8.4 4.6 4 4.6V19c4.4 0 6.4.5 8 2 1.6-1.5 3.6-2 8-2V4.6c-4.4 0-6.4.5-8 2Z" />
      <path d="M12 6.6V21" />
    </IconBase>
  );
}

/** Settings. */
export function IconGear(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.1 14.6a1.6 1.6 0 0 0 .32 1.76l.06.06a1.94 1.94 0 1 1-2.74 2.74l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46V20.4a1.94 1.94 0 1 1-3.88 0v-.1a1.6 1.6 0 0 0-1.04-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06A1.94 1.94 0 1 1 4.47 16.5l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97H3.2a1.94 1.94 0 1 1 0-3.88h.1a1.6 1.6 0 0 0 1.46-1.04 1.6 1.6 0 0 0-.32-1.76l-.06-.06A1.94 1.94 0 1 1 7.12 4.05l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .97-1.46V2.8a1.94 1.94 0 1 1 3.88 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.94 1.94 0 1 1 2.74 2.74l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.97h.18a1.94 1.94 0 1 1 0 3.88h-.1a1.6 1.6 0 0 0-1.46.97Z" />
    </IconBase>
  );
}

/** Forward action. */
export function IconArrowRight(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4.8 12h14.4" />
      <path d="m13 6 6.2 6-6.2 6" />
    </IconBase>
  );
}

/** Back action. */
export function IconArrowLeft(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M19.2 12H4.8" />
      <path d="m11 6-6.2 6 6.2 6" />
    </IconBase>
  );
}

/** Copy to clipboard. */
export function IconCopy(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" />
      <path d="M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" />
    </IconBase>
  );
}

/** Share an invite. */
export function IconShare(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.6v10.2" />
      <path d="m8.2 7.2 3.8-3.6 3.8 3.6" />
      <path d="M5.2 12.8v6.6a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1v-6.6" />
    </IconBase>
  );
}

/** Confirmed / ready. */
export function IconCheck(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m4.8 12.6 4.8 4.8L19.4 6.8" />
    </IconBase>
  );
}

/** Start the match. */
export function IconPlay(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7.5 4.8v14.4L19.2 12 7.5 4.8Z" />
    </IconBase>
  );
}

/** Host badge. */
export function IconCrown(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.6 8.2 7.4 12l4.6-7 4.6 7 3.8-3.8-1.4 10.4H5L3.6 8.2Z" />
    </IconBase>
  );
}
