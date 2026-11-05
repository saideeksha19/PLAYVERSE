import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../ui/Button';

describe('Button', () => {
  it('renders a labelled button', () => {
    render(<Button>Create a Room</Button>);
    expect(screen.getByRole('button', { name: 'Create a Room' })).toBeInTheDocument();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);

    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the reference variant colours', () => {
    render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="success">Success</Button>
        <Button variant="danger">Danger</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('bg-play-energy');
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass('bg-play-azure');
    expect(screen.getByRole('button', { name: 'Success' })).toHaveClass('bg-play-forest');
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('bg-play-coral');
  });

  it('stays disabled without firing onClick', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Busy
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Busy' });
    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a leading icon beside the label', () => {
    render(<Button icon={<svg data-testid="button-icon" />}>Go</Button>);
    expect(screen.getByTestId('button-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('spans its container when fullWidth', () => {
    render(<Button fullWidth>Wide</Button>);
    expect(screen.getByRole('button', { name: 'Wide' })).toHaveClass('w-full');
  });
});
