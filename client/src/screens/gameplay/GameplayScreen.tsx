import { useGame } from '../../state/game';
import { ColorClashScreen } from './ColorClashScreen';
import { MemoryMixScreen } from './MemoryMixScreen';

/**
 * Screen 7 dispatcher. The server's round payload names the mini-game, so a
 * reconnect or a re-rendered route always lands on the right board without
 * the client guessing from the round number.
 */
export function GameplayScreen() {
  const { question, reveal, intro } = useGame();
  const gameId = question?.gameId ?? reveal?.gameId ?? intro?.gameId ?? 'color-clash';

  return gameId === 'memory-mix' ? <MemoryMixScreen /> : <ColorClashScreen />;
}
