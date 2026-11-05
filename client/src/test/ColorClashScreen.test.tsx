import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { err, ok, type AnswerReceipt } from '@playverse/shared';
import { ColorClashScreen } from '../screens/gameplay/ColorClashScreen';
import { getFakeSocket } from './fakeSocket';
import { makeAnswers, makeQuestion, makeResult, makeReveal, twoPlayerRoom } from './fixtures';
import { renderWithSession } from './helpers';

const playingRoom = (overrides = {}) =>
  twoPlayerRoom({
    status: 'playing',
    roundIndex: 1,
    players: [
      { id: 'p1', nickname: 'Alice', avatarId: 'red', isHost: true, isReady: true, connected: true, score: 0, joinedAt: 0 },
      { id: 'p2', nickname: 'Bob', avatarId: 'blue', isHost: false, isReady: true, connected: true, score: 0, joinedAt: 1 },
    ],
    ...overrides,
  });

async function renderGame(question = makeQuestion()) {
  const { socket } = renderWithSession(<ColorClashScreen />, playingRoom());
  await screen.findByTestId('game-waiting');
  act(() => {
    socket.deliver('round:start', question);
  });
  await screen.findByTestId('clash-target-label');
  return socket;
}

describe('Color Clash gameplay screen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the target and every tile with a name and a symbol', async () => {
    await renderGame();

    expect(screen.getByTestId('clash-target-label')).toHaveTextContent('Amber ★');
    expect(screen.getAllByRole('img', { name: 'Amber ★' }).length).toBeGreaterThan(0);

    const tiles = screen.getByRole('list', { name: 'Answer tiles' });
    expect(tiles.querySelectorAll('button')).toHaveLength(4);
    for (const name of ['Azure ●', 'Crimson ▲', 'Leaf ■', 'Amber ★']) {
      expect(screen.getByRole('button', { name: `Answer ${name}` })).toBeEnabled();
    }

    // No answer key is rendered before the reveal.
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
  });

  it('renders the server deadline as a countdown and progress bar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const now = new Date('2026-01-01T00:00:00.000Z');
    vi.setSystemTime(now);

    await renderGame(makeQuestion({ startedAt: now.getTime(), endsAt: now.getTime() + 12_000 }));

    // Derived from the server deadline, so a few ms of jitter are expected.
    expect(screen.getByTestId('clash-timer')).toHaveTextContent(/1[12]s/);
    const bar = screen.getByRole('progressbar', { name: 'Round time remaining' });
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(95);
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(100);
  });

  it('locks the chosen tile, sends the answer and waits for the others', async () => {
    const socket = getFakeSocket();
    socket.respond('game:answer', () => ok<AnswerReceipt>({ choiceId: 'amber', receivedAt: Date.now() }));
    renderWithSession(<ColorClashScreen />, playingRoom());
    await screen.findByTestId('game-waiting');
    act(() => {
      socket.deliver('round:start', makeQuestion());
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Answer Amber ★' }));

    expect(socket.lastSent('game:answer')?.payload).toEqual({ roundIndex: 1, choiceId: 'amber' });
    const locked = await screen.findByTestId('clash-locked');
    expect(locked).toHaveTextContent('Locked in: Amber ★');
    expect(locked).toHaveTextContent('Waiting for 1 more player');
    expect(screen.getByRole('button', { name: 'Answer Amber ★' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Answer Azure ●' })).toBeDisabled();
  });

  it('shows who has answered without revealing what they picked', async () => {
    const socket = await renderGame();

    act(() => {
      socket.deliver('round:answers', makeAnswers({ answeredPlayerIds: ['p2'] }));
    });

    expect(await screen.findByTestId('answer-status-Bob')).toHaveTextContent('✓');
    expect(screen.getByTestId('answer-status-Alice')).toHaveTextContent('…');
    expect(screen.getByTestId('clash-answered')).toHaveTextContent('1 of 2 answered');
    // The other player's tile is not exposed anywhere.
    expect(screen.queryByText(/Bob picked/i)).not.toBeInTheDocument();
  });

  it('reflects authoritative score updates from room broadcasts', async () => {
    const socket = await renderGame();
    expect(screen.getByTestId('clash-score')).toHaveTextContent('0');

    act(() => {
      socket.deliver(
        'room:state',
        playingRoom({
          players: [
            { id: 'p1', nickname: 'Alice', avatarId: 'red', isHost: true, isReady: true, connected: true, score: 14, joinedAt: 0 },
            { id: 'p2', nickname: 'Bob', avatarId: 'blue', isHost: false, isReady: true, connected: true, score: 5, joinedAt: 1 },
          ],
        }),
      );
    });

    expect(await screen.findByTestId('clash-score')).toHaveTextContent('14');
  });

  it('surfaces a rejected answer from the server', async () => {
    const socket = getFakeSocket();
    socket.respond('game:answer', () => err<AnswerReceipt>('round-closed', 'That round is already over.'));
    renderWithSession(<ColorClashScreen />, playingRoom());
    await screen.findByTestId('game-waiting');
    act(() => {
      socket.deliver('round:start', makeQuestion());
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Answer Leaf ■' }));

    expect(await screen.findByTestId('clash-error')).toHaveTextContent('That round is already over.');
    expect(screen.getByRole('button', { name: 'Answer Leaf ■' })).toBeEnabled();
  });

  it('disables the tiles once the round has been revealed', async () => {
    const socket = await renderGame();

    act(() => {
      socket.deliver(
        'round:reveal',
        makeReveal({ results: [makeResult(), makeResult({ playerId: 'p2', nickname: 'Bob', correct: false, scoreDelta: -5, scoreAfter: 0, choiceId: 'azure' })] }),
      );
    });

    expect(screen.getByRole('button', { name: 'Answer Azure ●' })).toBeDisabled();
  });
});
