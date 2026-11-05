export interface LogoProps {
  className?: string;
  /** Show the "Play together. Anywhere." ribbon underneath. */
  ribbon?: boolean;
  /** Wordmark text (kept for tests / future lockups). */
  text?: string;
  ribbonText?: string;
}

/**
 * The PLAYVERSE wordmark, built from four stacked text layers:
 * extrusion → navy stroke → yellow gradient fill → white gloss.
 * Pure CSS, so it stays crisp at any size and needs no image asset.
 */
export function Logo({
  className = '',
  ribbon = true,
  text = 'PLAYVERSE',
  ribbonText = 'Play together. Anywhere.',
}: LogoProps) {
  return (
    <div className={['pv-logo', className].filter(Boolean).join(' ')}>
      <span className="pv-logo__text">
        <span className="pv-logo__layer pv-logo__layer--extrude">{text}</span>
        <span aria-hidden="true" className="pv-logo__layer pv-logo__layer--stroke">
          {text}
        </span>
        <span aria-hidden="true" className="pv-logo__layer pv-logo__layer--fill">
          {text}
        </span>
        <span aria-hidden="true" className="pv-logo__layer pv-logo__layer--gloss">
          {text}
        </span>
      </span>
      {ribbon ? <span className="pv-logo__ribbon">{ribbonText}</span> : null}
    </div>
  );
}
