import { Button } from './Button';

export interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  id?: string;
  disabled?: boolean;
}

/** Dimensional −/+ control (max players and similar bounded counts). */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  id,
  disabled = false,
}: StepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-play-cosmic/50 p-2 backdrop-blur-md">
      <Button
        size="sm"
        variant="dark"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="!h-10 !w-10 !px-0 text-xl"
      >
        −
      </Button>

      <span
        id={id}
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        className="min-w-20 text-center font-display text-xl font-bold text-play-soft tabular-nums"
      >
        {value}
      </span>

      <Button
        size="sm"
        variant="dark"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="!h-10 !w-10 !px-0 text-xl"
      >
        +
      </Button>
    </div>
  );
}
