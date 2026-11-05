import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, type RoomState } from '@playverse/shared';
import { RoundResultsScreen } from '../screens/results/RoundResultsScreen';
import { getFakeSocket } from './fakeSocket';
import { makeQuestion, makeResult, makeReveal, twoPlayerRoom } from './fixtures';
import { renderWithSession } from './helpers';

const roomIn = (status: RoomState['status'], roundIndex: number) =>
  twoPlayerRoom({
    status,
    roundIndex,
    players: [
      { id: 'p1', nickname: 'Alice', avatarId: 'red', isHost: true, isReady: true, connected: true, score: 14, joinedAt: 0 },
      { id: 'p2', nickname: 'Bob', avatarId: 'blue', isHost: false, isReady: true, connected: true, score: 0, joinedAt: 1 },
    ],
  });

/** Alice nailed it, Bob picked the wrong tile — the canonical reveal. */
const twoResults = [
  makeResult(),
  makeResult({
    playerId: 'p2',
    nickname: 'Bob',
    avatarId: 'blue',
    choiceId: 'azure',
    correct: false,
    points: 0,
    timeBonus: 0,
    penalty: -5,
    scoreDelta: -5,
    scoreAfter: 0,
    elapsedMs: 1500,
  }),
];

async function renderResults(meId = 'p1', roundIndex = 1, reveal = makeReveal({ results: twoResults })) {
  const { socket } = renderWithSession(
    <RoundResultsScreen />,
    roomIn('round-results', roundIndex),
    meId,
  );
  await screen.findByTestId('results-waiting');
  act(() => {
    socket.deliver('round:start', makeQuestion({ roundIndex }));
    socket.deliver('round:reveal', reveal);
  });
  await screen.findByTestId('round-results');
  return socket;
}

describe('Round Results screen', () => {
  it('reveals the correct tile and every player’s answer and delta', async () => {
    await renderResults();

    expect(screen.getByTestId('correct-answer')).toHaveTextContent('Amber ★');
    expect(screen.getByTestId('my-result')).toHaveTextContent('Correct — +10 and +4 speed');
    expect(screen.getByTestId('result-Alice')).toHaveTextContent('Picked Amber ★ · +10 +4 speed');
    expect(screen.getByTestId('result-Alice')).toHaveTextContent('+14');
    expect(screen.getByTestId('result-Bob')).toHaveTextContent('Picked Azure ● · wrong (-5)');
    expect(screen.getByTestId('result-Bob')).toHaveTextContent('-5');
  });

  it('puts the standings in score order with final scores', async () => {
    await renderResults();

    const rows = screen.getByRole('list', { name: 'Round results by player' });
    const names = [...rows.querySelectorAll('[data-testid^="result-"]')].map((row) =>
      row.getAttribute('data-testid'),
    );
    expect(names).toEqual(['result-Alice', 'result-Bob']);
  });

  it('reports a timeout without inventing a penalty', async () => {
    await renderResults(
      'p2',
      1,
      makeReveal({
        results: [
          makeResult(),
          makeResult({
            playerId: 'p2',
            nickname: 'Bob',
            avatarId: 'blue',
            choiceId: null,
            correct: false,
            points: 0,
            timeBonus: 0,
            penalty: 0,
            scoreDelta: 0,
            scoreAfter: 0,
            elapsedMs: null,
            connected: false,
          }),
        ],
      }),
    );

    expect(screen.getByTestId('my-result')).toHaveTextContent("You didn't answer in time.");
    expect(screen.getByTestId('result-Bob')).toHaveTextContent('Disconnected — no answer');
    expect(screen.getByTestId('result-Bob')).toHaveTextContent('±0');
  });

  it('counts down to the automatic advance and lets the host skip ahead', async () => {
    const socket = getFakeSocket();
    socket.respond('round:continue', () => ok(roomIn('intro', 2)));
    await renderResults();

    expect(screen.getByTestId('results-countdown')).toHaveTextContent('Next in 5s');
    const skip = screen.getByRole('button', { name: 'Skip ahead' });
    await userEvent.setup().click(skip);
    expect(socket.lastSent('round:continue')).toBeDefined();
  });

  it('offers guests no host control — the pause ends by itself', async () => {
    await renderResults('p2');

    expect(screen.queryByRole('button', { name: 'Skip ahead' })).not.toBeInTheDocument();
    expect(screen.getByText(/The host can skip the pause/)).toBeInTheDocument();
  });

  it('labels the fifth round as the last one and skips to the final results', async () => {
    await renderResults('p1', 5, makeReveal({ roundIndex: 5 }));

    expect(screen.getByText('Last round')).toBeInTheDocument();
    expect(screen.getByTestId('results-countdown')).toHaveTextContent('final standings are coming up');
    expect(screen.getByRole('button', { name: 'Skip to final results' })).toBeInTheDocument();
  });
});
