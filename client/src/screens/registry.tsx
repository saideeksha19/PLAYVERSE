import type { ComponentType } from 'react';
import { HomeScreen } from './home/HomeScreen';
import { PlayerSetupScreen } from './setup/PlayerSetupScreen';
import { CreateRoomScreen } from './create/CreateRoomScreen';
import { JoinRoomScreen } from './join/JoinRoomScreen';
import { LobbyScreen } from './lobby/LobbyScreen';
import { GameIntroScreen } from './intro/GameIntroScreen';
import { GameplayScreen } from './gameplay/GameplayScreen';
import { RoundResultsScreen } from './results/RoundResultsScreen';
import { MatchResultsScreen } from './results/MatchResultsScreen';
import { GuideScreen } from './guide/GuideScreen';
import { SettingsScreen } from './settings/SettingsScreen';
import { ConnectionScreen } from './connection/ConnectionScreen';

export type ScreenId =
  | 'home'
  | 'setup'
  | 'create-room'
  | 'join-room'
  | 'lobby'
  | 'intro'
  | 'gameplay'
  | 'round-results'
  | 'match-results'
  | 'guide'
  | 'settings'
  | 'connection';

export interface ScreenDefinition {
  id: ScreenId;
  /** Hash route, e.g. `/lobby`. */
  path: string;
  /** 1–12, matching the reference board. */
  index: number;
  title: string;
  subtitle: string;
  /** Roadmap phase that implements this screen. */
  phase: number;
  status: 'ready' | 'planned';
  component: ComponentType;
}

/** The 12-screen navigation structure. This registry is the contract: */
export const SCREENS: readonly ScreenDefinition[] = [
  {
    id: 'home',
    path: '/home',
    index: 1,
    title: 'Home',
    subtitle: 'Start your PLAYVERSE adventure',
    phase: 1,
    status: 'ready',
    component: HomeScreen,
  },
  {
    id: 'setup',
    path: '/setup',
    index: 2,
    title: 'Player Setup',
    subtitle: 'Choose your avatar and nickname',
    phase: 2,
    status: 'ready',
    component: PlayerSetupScreen,
  },
  {
    id: 'create-room',
    path: '/create-room',
    index: 3,
    title: 'Create Room',
    subtitle: 'Set up your match',
    phase: 2,
    status: 'ready',
    component: CreateRoomScreen,
  },
  {
    id: 'join-room',
    path: '/join-room',
    index: 4,
    title: 'Join Room',
    subtitle: 'Enter a code or open an invite link',
    phase: 2,
    status: 'ready',
    component: JoinRoomScreen,
  },
  {
    id: 'lobby',
    path: '/lobby',
    index: 5,
    title: 'Waiting Lobby',
    subtitle: "See who's here and get ready",
    phase: 2,
    status: 'ready',
    component: LobbyScreen,
  },
  {
    id: 'intro',
    path: '/intro',
    index: 6,
    title: 'Game Introduction',
    subtitle: 'Learn the rules before each round',
    phase: 2,
    status: 'ready',
    component: GameIntroScreen,
  },
  {
    id: 'gameplay',
    path: '/gameplay',
    index: 7,
    title: 'Live Gameplay',
    subtitle: 'Play together in real time',
    phase: 4,
    status: 'ready',
    component: GameplayScreen,
  },
  {
    id: 'round-results',
    path: '/round-results',
    index: 8,
    title: 'Round Results',
    subtitle: 'See answers and scores',
    phase: 4,
    status: 'ready',
    component: RoundResultsScreen,
  },
  {
    id: 'match-results',
    path: '/match-results',
    index: 9,
    title: 'Match Results',
    subtitle: 'Final leaderboard after 5 rounds',
    phase: 4,
    status: 'ready',
    component: MatchResultsScreen,
  },
  {
    id: 'guide',
    path: '/guide',
    index: 10,
    title: 'Player Guide',
    subtitle: 'Learn the games and tips',
    phase: 6,
    status: 'ready',
    component: GuideScreen,
  },
  {
    id: 'settings',
    path: '/settings',
    index: 11,
    title: 'Settings',
    subtitle: 'Adjust your experience',
    phase: 6,
    status: 'ready',
    component: SettingsScreen,
  },
  {
    id: 'connection',
    path: '/connection',
    index: 12,
    title: 'Connection & Recovery',
    subtitle: 'Get back in the game',
    phase: 6,
    status: 'ready',
    component: ConnectionScreen,
  },
];

export const SCREEN_BY_ID: Record<ScreenId, ScreenDefinition> = Object.fromEntries(
  SCREENS.map((screen) => [screen.id, screen]),
) as Record<ScreenId, ScreenDefinition>;

/**
 * Resolves a hash path; unknown paths fall back to Home.
 * Query strings (`#/join-room?code=AB47FH` invite links) are ignored for
 * routing — screens read them from `window.location.hash` themselves.
 */
export function getScreenByPath(path: string): ScreenDefinition {
  const [cleanPath] = path.split('?');
  return SCREENS.find((screen) => screen.path === cleanPath) ?? SCREEN_BY_ID.home;
}
