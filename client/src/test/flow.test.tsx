import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import App from '../App';

// Rendering the full app mounts the 3D world, which is slow under parallel
// test workers; these walks get a generous per-test budget.
const WALK_TIMEOUT = 20_000;

describe('Phase 2 navigation flow', () => {
  it('walks Home → Player Setup → Create Room', async () => {
    window.location.hash = '';
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Create a Room/ }));
    expect(window.location.hash).toBe('#/setup');
    expect(await screen.findByRole('heading', { level: 1, name: 'Player Setup' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(window.location.hash).toBe('#/create-room');
    expect(await screen.findByRole('heading', { level: 1, name: 'Create Room' })).toBeInTheDocument();
  }, WALK_TIMEOUT);

  it('walks Home → Player Setup → Join Room', async () => {
    window.location.hash = '';
    render(<App />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Join a Room/ }));
    expect(window.location.hash).toBe('#/setup');

    // hashchange lands asynchronously — wait for the screen to render.
    const continueButton = await screen.findByRole('button', { name: /Continue/ });
    await user.click(continueButton);
    expect(window.location.hash).toBe('#/join-room');
    expect(await screen.findByRole('heading', { level: 1, name: 'Join Room' })).toBeInTheDocument();
  }, WALK_TIMEOUT);

  it('reaches the guide, settings and connection screens from Home', async () => {
    window.location.hash = '#/guide';
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { level: 1, name: 'Player Guide' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Back to Home/ }));
    expect(window.location.hash).toBe('#/home');

    const settings = await screen.findByRole('button', { name: /^Settings$/ });
    await user.click(settings);
    expect(window.location.hash).toBe('#/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Connection & Recovery/ }));
    expect(window.location.hash).toBe('#/connection');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Connection & Recovery' }),
    ).toBeInTheDocument();
  }, WALK_TIMEOUT);
});
