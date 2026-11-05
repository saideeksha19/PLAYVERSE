import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PREFERENCES_KEY } from '../state/preferences';
import { GuideScreen } from '../screens/guide/GuideScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { ConnectionScreen } from '../screens/connection/ConnectionScreen';
import { getFakeSocket } from './fakeSocket';
import { twoPlayerRoom } from './fixtures';
import { renderWithProviders, renderWithSession } from './helpers';

describe('Phase 6 screens', () => {
  it('renders the player guide with both mini-games and the five-round flow', () => {
    renderWithProviders(<GuideScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'Player Guide' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Color Clash' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Memory Mix' })).toBeInTheDocument();
    expect(screen.getByText(/A match in 5 rounds/)).toBeInTheDocument();
    expect(screen.getByText(/2–8 players/)).toBeInTheDocument();
  });

  it('persists and applies settings preferences', async () => {
    renderWithProviders(<SettingsScreen />);
    const user = userEvent.setup();

    const motion = screen.getByRole('switch', { name: 'Reduce motion' });
    const contrast = screen.getByRole('switch', { name: 'High contrast panels' });
    expect(motion).toHaveAttribute('aria-checked', 'false');
    expect(contrast).toHaveAttribute('aria-checked', 'false');

    await user.click(motion);
    expect(motion).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');

    await user.click(contrast);
    expect(contrast).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.highContrast).toBe('true');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}')).toMatchObject({
      reduceMotion: true,
      highContrast: true,
    });

    await user.click(screen.getByRole('button', { name: 'Reset preferences' }));
    expect(motion).toHaveAttribute('aria-checked', 'false');
    expect(contrast).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.dataset.reduceMotion).toBe('false');
  });

  it('restores a saved room on the connection screen', async () => {
    renderWithSession(<ConnectionScreen />, twoPlayerRoom());

    expect(await screen.findByTestId('connection-room')).toHaveTextContent('AB47FH');
    expect(screen.getByTestId('connection-status')).toHaveTextContent('Connected');
    expect(screen.getByTestId('connection-room')).toHaveTextContent('Alice');
  });

  it('shows the offline state and retries the transport', async () => {
    const socket = getFakeSocket();
    renderWithProviders(<ConnectionScreen />);

    act(() => {
      socket.dropConnection();
    });
    expect(screen.getByTestId('connection-status')).toHaveTextContent(
      'Connection lost — trying to reconnect.',
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('retry-connection'));

    await waitFor(() =>
      expect(screen.getByTestId('connection-status')).toHaveTextContent(
        'Connected to the game server.',
      ),
    );
    expect(socket.connected).toBe(true);
  });
});
