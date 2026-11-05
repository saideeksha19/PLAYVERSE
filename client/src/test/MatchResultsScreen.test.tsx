import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok } from '@playverse/shared';
import { MatchResultsScreen } from '../screens/results/MatchResultsScreen';
import { getFakeSocket } from './fakeSocket';
import { makeLeaderboardEntry, makeResults, twoPlayerRoom } from './fixtures';
import { renderWithSession } from './helpers';

const finishedRoom = (overrides = {}) =>
  twoPlayerRoom({
    status: 'match-results',
    roundIndex: 5,
    players: [
      { id: 'p1', nickname: 'Alice', avatarId: 'red', isHost: true, isReady: false, connected: true, score: 42, joinedAt: 0 },
      { id: 'p2', nickname: 'Bob', avatarId: 'blue', isHost: false, isReady: false, connected: true, score: 31, joinedAt: 1 },
    ],
    ...overrides,
  });

async function renderResults(meId = 'p1') {
  const { socket } = renderWithSession(<MatchResultsScreen />, finishedRoom(), meId);
  await screen.findByTestId('match-results-waiting');
  act(() => {
    socket.deliver('match:results', makeResults());
  });
  await screen.findByTestId('match-results');
  return socket;
}

describe('Match Results screen', () => {
  it('announces the winner, the podium and the full standings', async () => {
    await renderResults();

    expect(screen.getByRole('heading', { level: 2, name: 'Alice wins!' })).toBeInTheDocument();
    expect(screen.getByTestId('my-finish')).toHaveTextContent('You finished #1 with 42 points.');
    expect(screen.getByTestId('podium-1')).toHaveTextContent('Alice');
    expect(screen.getByTestId('podium-1')).toHaveTextContent('42');
    expect(screen.getByTestId('podium-2')).toHaveTextContent('Bob');
    expect(screen.getByTestId('leaderboard-Alice')).toHaveTextContent('(You)');
    expect(screen.getByTestId('leaderboard-Bob')).toHaveTextContent('31');
  });

  it('shows the losing seat from that player’s point of view', async () => {
    await renderResults('p2');

    expect(screen.getByTestId('my-finish')).toHaveTextContent('You finished #2 with 31 points.');
    expect(screen.getByTestId('leaderboard-Bob')).toHaveTextContent('(You)');
    expect(screen.getByTestId('leaderboard-Alice')).not.toHaveTextContent('(You)');
  });

  it('lets the host replay or reopen the lobby', async () => {
    const socket = getFakeSocket();
    socket.respond('match:rematch', () => ok(finishedRoom({ status: 'intro', roundIndex: 1 })));
    socket.respond('match:lobby', () => ok(finishedRoom({ status: 'lobby', roundIndex: 0 })));
    await renderResults();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(socket.lastSent('match:rematch')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Back to Lobby' }));
    expect(socket.lastSent('match:lobby')).toBeDefined();
  });

  it('leaves replay to the host', async () => {
    await renderResults('p2');

    expect(screen.queryByRole('button', { name: 'Play Again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Lobby' })).not.toBeInTheDocument();
    expect(screen.getByTestId('waiting-host')).toHaveTextContent('The host can start a rematch');
  });

  it('orders the leaderboard exactly as the server sent it, ties included', async () => {
    const leaderboard = [
      makeLeaderboardEntry({ rank: 1, playerId: 'p3', nickname: 'Cara', avatarId: 'green', score: 42 }),
      makeLeaderboardEntry({ rank: 2, playerId: 'p1', nickname: 'Alice', score: 31 }),
      makeLeaderboardEntry({ rank: 3, playerId: 'p2', nickname: 'Bob', avatarId: 'blue', score: 31 }),
    ];
    const { socket } = renderWithSession(<MatchResultsScreen />, finishedRoom(), 'p1');
    await screen.findByTestId('match-results-waiting');
    act(() => {
      socket.deliver('match:results', makeResults({ leaderboard }));
    });

    const rows = screen.getByRole('list', { name: 'Full leaderboard' });
    const order = [...rows.querySelectorAll('[data-testid^="leaderboard-"]')].map((row) =>
      row.getAttribute('data-testid'),
    );
    expect(order).toEqual(['leaderboard-Cara', 'leaderboard-Alice', 'leaderboard-Bob']);
    expect(screen.getByRole('heading', { level: 2, name: 'Cara wins!' })).toBeInTheDocument();
  });
});
